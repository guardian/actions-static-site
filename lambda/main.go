package main

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/akrylysov/algnhsa"
	"github.com/golang-jwt/jwt/v4"
)

type InvalidEmail struct {
	Email string
}

func (ie InvalidEmail) Error() string {
	return "unsupported email: " + ie.Email
}

func main() {
	isGoogleAuth := os.Getenv("AUTH") == "google"
	fs := http.FileServer(http.Dir("/opt/site"))

	if isGoogleAuth {
		http.Handle("/", withAuth(fs))
	} else {
		http.Handle("/", fs)
	}

	// http.ListenAndServe("localhost:3030", nil)
	algnhsa.ListenAndServe(nil, nil)
}

func withAuth(h http.Handler) http.HandlerFunc {
	return func(resp http.ResponseWriter, req *http.Request) {
		// See https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html#user-claims-encoding
		tokenString := req.Header.Get("x-amzn-oidc-data")
		err := auth(tokenString, keyFunc, []string{"ES256"})

		if err != nil {
			statusForbidden(resp, err)
			return
		}

		h.ServeHTTP(resp, req)
	}
}

func statusForbidden(w http.ResponseWriter, err error) {
	w.WriteHeader(http.StatusForbidden)
	log.Printf("User failed authentication with: %v", err)
	fmt.Fprintln(w, "Status Forbidden (403) - you are not authorised to access this site.")
}

func auth(tokenString string, keyFunc func(token *jwt.Token) (interface{}, error), validMethods []string) error {
	token, err := jwt.Parse(tokenString, keyFunc, jwt.WithValidMethods(validMethods))
	if err != nil {
		return err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return errors.New("jwt token is invalid")
	}

	email := fmt.Sprintf("%v", claims["email"])
	if !strings.HasSuffix(email, "@guardian.co.uk") {
		return InvalidEmail{email}
	}

	return nil
}

// Takes a token and gets the signature key.
func keyFunc(token *jwt.Token) (interface{}, error) {
	region := os.Getenv("AWS_REGION")
	kid := fmt.Sprintf("%v", token.Header["kid"])

	resp, err := http.Get(fmt.Sprintf("https://public-keys.auth.elb.%s.amazonaws.com/%s", region, kid))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	return io.ReadAll(resp.Body)
}
