package middleware

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v4"
)

type InvalidEmail struct {
	Email string
}

func (ie InvalidEmail) Error() string {
	return "unsupported email: " + ie.Email
}

// withDomainPrefix adds the value of req.Host as a prefix to the path. The idea
// is that files for a specific static site (host) like in the same S3 bucket
// but prefixed by host. E.g.
// s3://the-static-bucket/example.gutools.co.uk/index.html.
func WithDomainPrefix(h http.Handler) http.HandlerFunc {
	return func(resp http.ResponseWriter, req *http.Request) {
		host, _, _ := strings.Cut(req.Host, ":")
		req.URL.Path = host + req.URL.Path

		h.ServeHTTP(resp, req)
	}
}

// withAuth handles token validation and ensures the contained email is a
// @guardian.co.uk one. Note, the actual Open Auth flow is handled at the ALB,
// but this is required both to confirm the email domain and as an extra
// security step in case the EC2 instance is somehow accessed not via the ALB.
func WithAuth(h http.Handler) http.HandlerFunc {
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
