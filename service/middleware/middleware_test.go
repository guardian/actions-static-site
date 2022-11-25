package middleware

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v4"
	"github.com/guardian/actions-static-site/service/store"
)

func TestAuth(t *testing.T) {
	// The examples were generated at https://jwt.io/#debugger-io with alg=HS256
	// and secret as 'my-secret-key'.
	keyFunc := func(token *jwt.Token) (interface{}, error) {
		return []byte("my-secret-key"), nil
	}

	testCases := []struct {
		Name     string
		Header   string
		IsValid  bool
		ErrorMsg string
	}{
		{Name: "Valid", IsValid: true, Header: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJlbWFpbCI6Im5pY29sYXMubG9uZ0BndWFyZGlhbi5jby51ayJ9.lDOczsGP9oXizyhUyy-upkk8tZ7GHWUo4WKR3xRbimA"},
		{Name: "Invalid Email", IsValid: false, Header: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJlbWFpbCI6Im5pY29sYXMubG9uZ0Bmb28uZ3VhcmRpYW4uY28udWsifQ.5B53GiUvTKG7A2IqiBv5BX_OL33kAprQe7WvF9hKa8I", ErrorMsg: "unsupported email"},
	}

	for _, test := range testCases {
		err := auth(test.Header, keyFunc, []string{"HS256"})
		if test.IsValid {
			if err != nil {
				t.Fatalf("%s - unexpected auth failure: %v", test.Name, err)
			}
		} else {
			if err == nil {
				t.Fatalf("%s - unexpected auth success; expected %s", test.Name, test.ErrorMsg)
			}

			if !strings.Contains(err.Error(), test.ErrorMsg) {
				t.Fatalf("%s - error did not match: got %v; expected %s", test.Name, err, test.ErrorMsg)
			}
		}
	}
}

func TestWithDomainPrefix(t *testing.T) {
	host := "example.gutools.co.uk"
	store := store.MemoryStore{}
	want := "foo"

	store[host+"/foo.txt"] = []byte(want)

	var testHandler http.HandlerFunc = func(resp http.ResponseWriter, req *http.Request) {
		fmt.Fprint(resp, string(store[req.URL.Path]))
	}

	server := httptest.NewServer(WithDomainPrefix(testHandler))
	defer server.Close()

	req, _ := http.NewRequest(http.MethodGet, server.URL+"/foo.txt", nil)
	req.Host = host + ":8080"

	resp, err := http.DefaultClient.Do(req)
	check(t, err, "unable to fetch from test server")
	defer resp.Body.Close()

	got, err := io.ReadAll(resp.Body)
	check(t, err, "unable to read body")

	if string(got) != want {
		t.Fatalf("got %s; want %s", string(got), want)
	}
}

func check(t *testing.T, err error, msg string) {
	if err != nil {
		t.Fatalf("%s: %v", msg, err)
	}
}
