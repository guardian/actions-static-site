package main

import (
	"bytes"
	"fmt"
	"log"
	"net/http"
	"os"
	"path"
	"time"

	"github.com/guardian/actions-static-site/service/middleware"
	"github.com/guardian/actions-static-site/service/s3"
	"github.com/guardian/actions-static-site/service/store"
)

type Config struct {
	Port, Bucket, CodeBucket string

	// Override when local for easier testing.
	RequireAuth bool
	Profile     string
}

func required(key string) string {
	got := os.Getenv(key)
	if got == "" {
		log.Fatalf("required env var %s is missing", key)
	}

	return got
}

func optional(key, fallback string) string {
	got := os.Getenv(key)
	if got == "" {
		return fallback
	}

	return got
}

func getConfig() Config {
	return Config{
		Bucket:      required("BUCKET"),
		CodeBucket:  required("CODE_BUCKET"),
		Port:        optional("PORT", "3333"),
		RequireAuth: optional("REQUIRE_AUTH", "true") != "false",
		Profile:     optional("PROFILE", ""),
	}
}

func main() {
	config := getConfig()
	store := s3.New(config.Bucket, config.Profile)
	codeStore := s3.New(config.CodeBucket, config.Profile)

	http.HandleFunc("/healthcheck", middleware.WithRequestLog(http.HandlerFunc(ok)))

	if config.RequireAuth {
		http.Handle("/", middleware.WithRequestLog(middleware.WithAuth(middleware.WithDomainPrefix(storeServer(store, codeStore)))))
	} else {
		http.Handle("/", middleware.WithRequestLog(middleware.WithDomainPrefix(storeServer(store, codeStore))))
	}

	log.Printf("Server starting on http://localhost:%s.", config.Port)
	err := http.ListenAndServe(fmt.Sprintf(":%s", config.Port), nil)
	log.Fatal(err.Error())
}

func ok(w http.ResponseWriter, r *http.Request) {
	fmt.Fprint(w, "OK")
}

func storeServer(store store.Store, fallbackStore store.Store) http.HandlerFunc {
	return func(resp http.ResponseWriter, req *http.Request) {
		key := req.URL.Path
		got, err := store.Get(key)
		if err != nil {
			got, err = fallbackStore.Get(key)
		}
		if err != nil {
			log.Printf("unable to fetch from store for path %s and host %s: %v", req.URL.Path, req.Host, err)
			statusNotFound(resp)
		}

		_, name := path.Split(key)
		http.ServeContent(resp, req, name, time.Time{}, bytes.NewReader(got))
	}
}

func statusNotFound(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNotFound)
	fmt.Fprintln(w, "Status Not Found (404) - resource not found.")
}
