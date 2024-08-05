#!/usr/bin/env bash

#
# Manual test to run a full creation / basic usage / deletion workflow from scratch
# without user interaction to verify the CLI "happy path" usage is working as expected
#
# Remain manual for now to ensure our AWS instance doesn't remain alive costing $$$
#

set -e

# Build local image to run tests
export CLOUDYPAD_IMAGE="crafteo/cloudypad:local"
export CLOUDYPAD_CLI_LAUNCHER_DEBUG=true

task build-local

cloudypad_cmd="./cloudypad.sh"
# cloudypad_cmd="npx ts-node src/index.ts"

function create_destroy_aws() {
    
    instance_name="test-create-destroy-aws"

    $cloudypad_cmd create aws \
        --name $instance_name \
        --private-ssh-key ~/.ssh/id_ed25519 \
        --instance-type g4dn.xlarge \
        --disk-size 100 \
        --public-ip-type static \
        --region eu-central-1 \
        --yes --overwrite-existing

    $cloudypad_cmd get $instance_name

    $cloudypad_cmd list | grep $instance_name

    $cloudypad_cmd stop $instance_name

    $cloudypad_cmd destroy $instance_name
}

function create_destroy_paperspace() {
    
    instance_name="test-create-destroy-paperspace"

    $cloudypad_cmd create paperspace \
        --name $instance_name \
        --private-ssh-key ~/.ssh/id_ed25519 \
        --machine-type P4000 \
        --disk-size 100 \
        --public-ip-type static \
        --region "East Coast (NY2)" \
        --yes --overwrite-existing

    $cloudypad_cmd get $instance_name

    $cloudypad_cmd list | grep $instance_name

    $cloudypad_cmd stop $instance_name

    $cloudypad_cmd destroy $instance_name
}

case "$1" in
    aws)
        create_destroy_aws
        ;;
    paperspace)
        create_destroy_paperspace
        ;;
    *)
        echo "Usage: $0 {aws|paperspace}"
        ;;
esac

