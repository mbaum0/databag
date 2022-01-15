package main

import (
  "strings"
  "testing"
  "net/http/httptest"
  "encoding/base64"
  "encoding/json"
  app "databag/internal"
  "databag/internal/store"
)

func TestSetup(t *testing.T) {

  store.SetPath("file::memory:?cache=shared");
  //store.SetPath("databag.db");
  Claimable(t);
  Claim(t);
  SetConfig(t);
  GetConfig(t);
}

func Claimable(t *testing.T) {
  r := httptest.NewRequest("GET", "/admin/claimable", nil)
  w := httptest.NewRecorder()
  app.GetNodeClaimable(w, r)

  //body, _ := ioutil.ReadAll(resp.Body)
  resp := w.Result()
  dec := json.NewDecoder(resp.Body);
  var res bool
  err := dec.Decode(&res)
  if err != nil {
    t.Errorf("failed to get claimable response")
  }
  if resp.StatusCode != 200 {
    t.Errorf("server not initially claimable")
  }
}

func Claim(t *testing.T) {
  auth := base64.StdEncoding.EncodeToString([]byte("admin:pass"))
  r := httptest.NewRequest("PUT", "/admin/claim", nil)
  r.Header.Add("Authorization","Basic " + auth)
  w := httptest.NewRecorder()
  app.SetNodeClaim(w, r)
  if w.Code != 200 {
    t.Errorf("server not initially claimable")
  }
}

func SetConfig(t *testing.T) {
  config := app.NodeConfig{Domain: "example.com", PublicLimit: 1024, AccountStorage: 4096}
  auth := base64.StdEncoding.EncodeToString([]byte("admin:pass"))
  body,_ := json.Marshal(config)
  r := httptest.NewRequest("PUT", "/admin/config", strings.NewReader(string(body)))
  r.Header.Add("Authorization","Basic " + auth)
  w := httptest.NewRecorder()
  app.SetNodeConfig(w, r);
  if w.Code != 200 {
    t.Errorf("failed to set node config")
  }
}

func GetConfig(t *testing.T) {
  auth := base64.StdEncoding.EncodeToString([]byte("admin:pass"))
  r := httptest.NewRequest("GET", "/admin/config", nil)
  r.Header.Add("Authorization","Basic " + auth)
  w := httptest.NewRecorder()
  app.GetNodeConfig(w, r);

  resp := w.Result();
  dec := json.NewDecoder(resp.Body);
  var config app.NodeConfig;
  dec.Decode(&config);
  if resp.StatusCode != 200 {
    t.Errorf("failed to get node config")
  }
  if config.Domain != "example.com" {
    t.Error("failed to set config domain");
  }
  if config.PublicLimit != 1024 {
    t.Error("failed to set public limit");
  }
  if config.AccountStorage != 4096 {
    t.Error("failed to set account storage");
  }
}