package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/guardian/actions-static-site/service/middleware"
	"github.com/guardian/actions-static-site/service/s3"
	"github.com/guardian/actions-static-site/service/store"
)

type Config struct {
	Port, Bucket string
}

func getRequired(key string) string {
	got := os.Getenv(key)
	if got == "" {
		log.Fatalf("required env var %s is missing", key)
	}

	return got
}

func getConfig() Config {
	return Config{Bucket: getRequired("BUCKET"), Port: getRequired("PORT")}
}

func main() {
	config := getConfig()
	store := s3.New(config.Bucket)
	http.Handle("/", middleware.WithAuth(middleware.WithDomainPrefix(storeServer(store))))

	err := http.ListenAndServe(fmt.Sprintf(":%s", config.Port), nil)
	log.Fatal(err.Error())
}

func storeServer(store store.Store) http.HandlerFunc {
	return func(resp http.ResponseWriter, req *http.Request) {
		got, err := store.Get(req.URL.Path)
		if err != nil {
			statusNotFound(resp)
		}

		contentType := http.DetectContentType(got)
		resp.Header().Add("Content-Type", contentType)
		fmt.Fprintln(resp, got)
	}
}

func statusNotFound(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNotFound)
	fmt.Fprintln(w, "Status Not Found (404) - resource not found.")
}
