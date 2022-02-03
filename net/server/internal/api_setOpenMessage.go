package databag

import (
  "time"
  "errors"
  "net/http"
  "encoding/hex"
  "gorm.io/gorm"
  "github.com/google/uuid"
  "databag/internal/store"
  "github.com/theckman/go-securerandom"
)

func SetOpenMessage(w http.ResponseWriter, r *http.Request) {

  var message DataMessage
  if err := ParseRequest(r, w, &message); err != nil {
    ErrResponse(w, http.StatusBadRequest, err)
    return
  }

  var connect Connect
  guid, messageType, ts, err := ReadDataMessage(&message, &connect)
  if messageType != APP_MSGCONNECT || err != nil {
    ErrResponse(w, http.StatusBadRequest, err)
    return
  }
  if ts + APP_CONNECTEXPIRE < time.Now().Unix() {
    ErrResponse(w, http.StatusBadRequest, errors.New("message has expired"))
    return
  }

  // load referenced account
  var account store.Account
  if err := store.DB.Where("guid = ?", connect.Contact).First(&account).Error; err != nil {
    if errors.Is(err, gorm.ErrRecordNotFound) {
      ErrResponse(w, http.StatusNotFound, err)
    } else {
      ErrResponse(w, http.StatusInternalServerError, err)
    }
    return
  }

  // see if card exists
  slot := &store.CardSlot{}
  card := &store.Card{}
  if err := store.DB.Where("account_id = ? AND guid = ?", account.Guid, guid).First(card).Error; err != nil {
    if !errors.Is(err, gorm.ErrRecordNotFound) {
      ErrResponse(w, http.StatusInternalServerError, err)
      return
    }

    // create new card
    data, res := securerandom.Bytes(APP_TOKENSIZE)
    if res != nil {
      ErrResponse(w, http.StatusInternalServerError, res)
      return
    }
    card.Guid = guid
    card.Username = connect.Handle
    card.Name = connect.Name
    card.Description = connect.Description
    card.Location = connect.Location
    card.Image = connect.Image
    card.Version = connect.Version
    card.Node = connect.Node
    card.ProfileRevision = connect.ProfileRevision
    card.Status = APP_CARDPENDING
    card.NotifiedProfile = connect.ProfileRevision
    card.NotifiedContent = connect.ContentRevision
    card.NotifiedView = connect.ViewRevision
    card.OutToken = connect.Token
    card.InToken = hex.EncodeToString(data)
    card.AccountID = account.Guid

    // create new card or update existing
    if err = store.DB.Preload("Card").Where("account_id = ? AND card_id = 0", account.ID).First(slot).Error; err != nil {
      if !errors.Is(err, gorm.ErrRecordNotFound) {
        ErrResponse(w, http.StatusInternalServerError, err)
        return
      }
      err = store.DB.Transaction(func(tx *gorm.DB) error {
        if res := tx.Save(card).Error; res != nil {
          return res
        }
        slot.CardSlotId = uuid.New().String()
        slot.AccountID = account.ID
        slot.Revision = account.CardRevision + 1
        slot.CardID = card.ID
        slot.Card = card
        if res := tx.Save(slot).Error; res != nil {
          return res
        }
        if res := tx.Model(&account).Update("card_revision", account.CardRevision + 1).Error; res != nil {
          return res
        }
        return nil
      })
      if err != nil {
        ErrResponse(w, http.StatusInternalServerError, err)
        return
      }
    } else {
      err = store.DB.Transaction(func(tx *gorm.DB) error {
        if res := tx.Save(card).Error; res != nil {
          return res
        }
        slot.Revision = account.CardRevision + 1
        slot.CardID = card.ID
        if res := tx.Save(slot).Error; res != nil {
          return res
        }
        if res := tx.Model(&account).Update("card_revision", account.CardRevision + 1).Error; res != nil {
          return res
        }
        return nil
      })
      if err != nil {
        ErrResponse(w, http.StatusInternalServerError, err)
        return
      }
    }

  } else {

    // update profile if revision changed
    if connect.ProfileRevision > card.ProfileRevision {
      card.Username = connect.Handle
      card.Name = connect.Name
      card.Description = connect.Description
      card.Location = connect.Location
      card.Image = connect.Image
      card.Version = connect.Version
      card.Node = connect.Node
      card.ProfileRevision = connect.ProfileRevision
    }
    if connect.ContentRevision > card.NotifiedContent {
      card.NotifiedContent = connect.ContentRevision
    }
    if connect.ViewRevision > card.NotifiedView {
      card.NotifiedView = connect.ViewRevision
    }
    if connect.ProfileRevision > card.NotifiedProfile {
      card.NotifiedProfile = connect.ProfileRevision
    }
    if card.Status == APP_CARDCONFIRMED {
      card.Status = APP_CARDREQUESTED
    }
    if card.Status == APP_CARDCONNECTING {
      card.Status = APP_CARDCONNECTED
    }
    card.DataRevision += 1
    card.OutToken = connect.Token

    // save contact card
    err  = store.DB.Transaction(func(tx *gorm.DB) error {
      if res := tx.Save(&card).Error; res != nil {
        return res
      }
      if res := tx.Preload("Card").Where("account_id = ? AND card_id = ?", account.ID, card.ID).First(&slot).Error; res != nil {
        if !errors.Is(res, gorm.ErrRecordNotFound) {
          return nil
        }
        slot = &store.CardSlot{
          CardSlotId: uuid.New().String(),
          AccountID: account.ID,
          Revision: account.CardRevision + 1,
          CardID: card.ID,
          Card: card,
        }
      } else {
        slot.Revision = account.CardRevision + 1
      }
      if res := tx.Preload("Card").Save(slot).Error; res != nil {
        return res
      }
      if res := tx.Model(&account).Update("card_revision", account.CardRevision + 1).Error; res != nil {
        return res
      }
      return nil
    })
    if err != nil {
      ErrResponse(w, http.StatusInternalServerError, err)
      return
    }
  }

  status := &ContactStatus{
    Token: slot.Card.InToken,
    Status: slot.Card.Status,
  }
  SetStatus(&account)
  WriteResponse(w, &status)
}
