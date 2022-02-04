package databag

import (
  "errors"
  "net/http"
  "gorm.io/gorm"
  "github.com/gorilla/mux"
  "databag/internal/store"
)

func SetCardNotes(w http.ResponseWriter, r *http.Request) {

  account, code, err := BearerAppToken(r, false);
  if err != nil {
    ErrResponse(w, code, err)
    return
  }

  // scan parameters
  params := mux.Vars(r)
  cardId := params["cardId"]

  var notes string
  if err := ParseRequest(r, w, &notes); err != nil {
    ErrResponse(w, http.StatusBadRequest, err)
    return
  }

  // load referenced card
  var slot store.CardSlot
  if err := store.DB.Preload("Card").Where("account_id = ? AND card_slot_id = ?", account.ID, cardId).First(&slot).Error; err != nil {
    if !errors.Is(err, gorm.ErrRecordNotFound) {
      ErrResponse(w, http.StatusInternalServerError, err)
    } else {
      ErrResponse(w, http.StatusNotFound, err)
    }
    return
  }
  if slot.Card == nil {
    ErrResponse(w, http.StatusNotFound, errors.New("card has been deleted"))
    return
  }

  // update card
  slot.Revision = account.CardRevision + 1
  slot.Card.DetailRevision += 1
  slot.Card.Notes = notes

  // save and update contact revision
  err = store.DB.Transaction(func(tx *gorm.DB) error {
    if res := tx.Save(&slot.Card).Error; res != nil {
      return res
    }
    if res := tx.Preload("Card").Save(&slot).Error; res != nil {
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

  SetStatus(account)
  WriteResponse(w, getCardDetailModel(&slot));
}
