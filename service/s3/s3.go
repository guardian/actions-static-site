package s3

import (
	"context"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsS3 "github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Store struct {
	bucket string
	client awsS3.Client
}

// Reads usual creds chain
func New(bucket string) S3Store {
	config := aws.NewConfig()
	client := awsS3.NewFromConfig(*config)
	return S3Store{client: *client, bucket: bucket}
}

func (s S3Store) Get(key string) ([]byte, error) {
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
