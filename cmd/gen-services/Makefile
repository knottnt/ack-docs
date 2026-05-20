.PHONY: build run clean

CONTROLLERS_DIR ?= $(HOME)/go/src/github.com/aws-controllers-k8s
SERVICES_OUTPUT ?= ../../website/src/data/services.json
API_REF_OUTPUT  ?= ../../website/src/data/api-reference-index.json

build:
	go build -o gen-services

run: build
	./gen-services \
		--controllers-dir=$(CONTROLLERS_DIR) \
		--services-output=$(SERVICES_OUTPUT) \
		--api-ref-index=$(API_REF_OUTPUT)

clean:
	rm -f gen-services
