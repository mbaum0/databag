package databag

import (
	"databag/internal/store"
	"gorm.io/gorm"
	"net/http"
)

//SetAccountNotification sets whether notifications should be received
func SetAccountNotification(w http.ResponseWriter, r *http.Request) {

	account, code, err := ParamAgentToken(r, true)
	if err != nil {
		ErrResponse(w, code, err)
		return
	}

	var flag bool
	if err := ParseRequest(r, w, &flag); err != nil {
		ErrResponse(w, http.StatusBadRequest, err)
		return
	}

	err = store.DB.Transaction(func(tx *gorm.DB) error {
		if res := tx.Model(account).Update("push_enabled", flag).Error; res != nil {
			ErrResponse(w, http.StatusInternalServerError, res)
			return res
		}
		if res := tx.Model(&account).Update("account_revision", account.AccountRevision+1).Error; res != nil {
			return res
		}
		return nil
	})
	if err != nil {
		ErrResponse(w, http.StatusInternalServerError, err)
		return
	}

	SetStatus(account)
	WriteResponse(w, nil)
}