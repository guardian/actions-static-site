package s3

import (
	"context"
	"io"
	"log"

	"github.com/aws/aws-sdk-go-v2/config"
	awsS3 "github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Store struct {
	bucket string
	client awsS3.Client
}

// Reads usual creds chain
func New(bucket, profile string) S3Store {
	config, err := config.LoadDefaultConfig(
		context.TODO(),
		config.WithRegion("eu-west-1"),
		config.WithSharedConfigProfile("deployTools"),
	)

	if err != nil {
		log.Fatalf("unable to load AWS default config: %v", err)
	}

	client := awsS3.NewFromConfig(config)
	return S3Store{client: *client, bucket: bucket}
}

func (s S3Store) Get(key string) ([]byte, error) {
	log.Printf("fetching from S3: %s", key)

	resp, err := s.client.GetObject(context.TODO(), &awsS3.GetObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	})

	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}
