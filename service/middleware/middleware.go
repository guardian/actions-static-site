package middleware

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v4"
)

func init() {
	// Unfortunatell AWS sends invalid JWT tokens and this flag is required to
	// ensure they are parsed correctly. See e.g.
	// https://github.com/golang-jwt/jwt/pull/117.
	jwt.DecodePaddingAllowed = true
}

type InvalidEmail struct {
	Email string
}

func (ie InvalidEmail) Error() string {
	return "unsupported email: " + ie.Email
}

func WithRequestLog(h http.Handler) http.HandlerFunc {
	return func(resp http.ResponseWriter, req *http.Request) {
		log.Printf("%s %s %s", req.Method, req.Host, req.URL.Path)
		h.ServeHTTP(resp, req)
	}
}

// withDomainPrefix adds the value of req.Host as a prefix to the path. Also
// rewrites '/' to '/index.html'. The idea is that files for a specific static
// site (host) like in the same S3 bucket but prefixed by host. E.g.
// s3://the-static-bucket/example.gutools.co.uk/index.html.
func WithDomainPrefix(h http.Handler) http.HandlerFunc {
	return func(resp http.ResponseWriter, req *http.Request) {
		host, _, _ := strings.Cut(req.Host, ":")
		path := req.URL.Path
		req.URL.Path = host + path

		if strings.HasSuffix(path, "/") {
			req.URL.Path += "index.html"
		}

		log.Printf("updated req path is: %s", req.URL.Path)

		h.ServeHTTP(resp, req)
	}
}

// withAuth handles token validation and ensures the contained email is a
// @guardian.co.uk one. Note, the actual Open Auth flow is handled at the ALB,
// but this is required both to confirm the email domain and as an extra
// security step in case the EC2 instance is somehow accessed not via the ALB.
func WithAuth(h http.Handler) http.HandlerFunc {
	return func(resp http.ResponseWriter, req *http.Request) {
	  if strings.HasSuffix(req.URL.Path, "/_prout") {
	    // https://github.com/guardian/prout needs no auth, so we skip it for **/_prout
	    h.ServeHTTP(resp, req)
	    return
	  }

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
		return fmt.Errorf("unable to parse token: %w", err)
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
	region := "eu-west-1"
	kid := fmt.Sprintf("%v", token.Header["kid"])

	resp, err := http.Get(fmt.Sprintf("https://public-keys.auth.elb.%s.amazonaws.com/%s", region, kid))
	if err != nil {
		log.Printf("request for public key failed: %v", err)
		return nil, err
	}
	defer resp.Body.Close()

	pem, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("unable to read public key: %v", err)
		return nil, err
	}

	publicKey, err := jwt.ParseECPublicKeyFromPEM(pem)
	if err != nil {
		log.Printf("unable to parse pem into public key: %v", err)
		return nil, err
	}

	return publicKey, nil
}
