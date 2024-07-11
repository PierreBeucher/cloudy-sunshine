#!/usr/bin/env bash

#
# CloudyPad core script to manage and configure instances.
# THIS IS A POC SCRIPT IN SHELL FORMAT. It will probably be rewritten using Typescript or Python
# though interface shall remain roughly the same.
#

set -e

usage() {
    echo "Usage: $0 {init|start|stop|restart|list|get}"
    exit 1
}


# TODO in user's home directory
cloudypad_home=$PWD/tmp/cloudypad_home

cloudypad_supported_clouders=("aws" "paperspace")

#
# Utils
#

# Prompt user for a choice
prompt_choice() {
    prompt=$1
    options=("${@:2}")

    # If possible show most options on screen with max 10
    fzf_length=$((${#options[@]} + 2))
    [ $fzf_length -gt 10 ] && fzf_length=10

    choice=$(printf "%s\n" "${options[@]}" | fzf --height $fzf_length --prompt="$prompt")
    echo "$choice"
}

#
# Core
#

# Initialize and configure a new instance
# Prompt user for cloud provider to use and whether or not an existing shall be used 
init() {
    
    # Initialize home directory
    mkdir -p $cloudypad_home

    cloudypad_instance_name_default="mycloudypad"
    read -p "How shall we name your Cloudy Pad instance? (default: $cloudypad_instance_name_default) " cloudypad_instance_name

    cloudypad_instance_name=${cloudypad_instance_name:-$cloudypad_instance_name_default}
    echo "Initializing Cloudy Pad instance '$cloudypad_instance_name'"

    local cloudypad_clouder=$(prompt_choice "Which cloud provider do you want to use?" ${cloudypad_supported_clouders[@]})

    echo "Using provider: $cloudypad_clouder"

    echo
    echo "To initialize your CloudyPad instance we need a machine in the Cloud."
    echo "CloudyPad can use an existing machine or create one for you:"
    echo " - I can create a machine quickly with sane default and security configuration 🚀 (you'll be prompted for a few configs)"
    echo " - You can create your own instance and give me its ID. It will let you customize more elements but requires advanced knowledge 🧠"

    local machine_create_choice
    local machine_choice_create="Create a machine for me"
    local machine_choice_use_existing="I'll bring my own machine"
    machine_create_choice_user=$(prompt_choice "Create a machine or use existing one?" "$machine_choice_create" "$machine_choice_use_existing")

    case "$machine_create_choice_user" in
        "$machine_choice_create")
            echo
            echo "Sure, let's create a new machine!"
            machine_create_choice=$CLOUDYPAD_INIT_CREATE
            ;;
        "$machine_choice_use_existing")
            echo
            echo "Sure, let's use an existing machine!"
            machine_create_choice=$CLOUDYPAD_INIT_USE_EXISTING
            ;;
        *)
            echo "Invalid choice $machine_create_choice_user. This is probably a bug, please file an issue."
            exit 3
            ;;
    esac

    # Other clouder may be supported
    case "$cloudypad_clouder" in
        paperspace)
            init_paperspace $cloudypad_instance_name $machine_create_choice
            ;;
        aws)
            init_aws $cloudypad_instance_name $machine_create_choice
            ;;
        *)
            echo "Clouder $cloudypad_clouder is not supported. This is probably a bug, please file an issue."
            exit 6
            ;;
    esac
}

CLOUDYPAD_INIT_CREATE='c'
CLOUDYPAD_INIT_USE_EXISTING='e'

init_create_machine() {
    cloudypad_clouder=$1
    echo "Would create $cloudypad_clouder machine" # TODO
}

get_cloudypad_instance_dir() {
    cloudypad_instance_name=$1
    echo "$cloudypad_home/instances/$cloudypad_instance_name"
}

get_cloudypad_instance_ansible_inventory_path(){
    cloudypad_instance_name=$1
    echo "$(get_cloudypad_instance_dir $cloudypad_instance_name)/ansible-inventory"
}

check_instance_exists() {
    cloudypad_instance_name=$1
    cloudypad_instance_dir=$(get_cloudypad_instance_dir $cloudypad_instance_name)

    # Check if the inventory path exists
    if [ ! -d "$cloudypad_instance_dir" ]; then
        echo "Error: Instance's directory not found: $cloudypad_instance_dir"
        exit 1
    fi
}

update() {
    if [ $# -eq 0 ]; then
        echo "Update requires at least 1 argument: instance to update"
        echo "Use 'list' subcommand to see existing instances"
        exit 1
    fi

    cloudypad_instance_name=$1
    run_update_ansible $cloudypad_instance_name
}

list() {
    # Simply list existing directories in instances directories
    # Naive but sufficient for now
    find $cloudypad_home/instances -mindepth 1 -maxdepth 1 -type d -exec basename {} \;
}

instance_stop_start_restart_get() {
    cloudypad_instance_action=$1
    cloudypad_instance_name=$2

    if [ -z "$cloudypad_instance_name" ]; then
        echo "$cloudypad_instance_action requires at least 1 argument: instance name"
        echo "Use 'list' subcommand to see existing instances"
        exit 1
    fi

    check_instance_exists $cloudypad_instance_name

    inventory_path=$(get_cloudypad_instance_ansible_inventory_path $cloudypad_instance_name)

    cloudypad_clouder=$(cat $inventory_path | yq .all.vars.cloudypad_clouder -r)
    cloudypad_machine_id=$(cat $inventory_path | yq .all.vars.cloudypad_machine_id -r)

    case "$cloudypad_clouder" in
        paperspace)
            paperspace_machine_action $cloudypad_instance_action $cloudypad_machine_id
            ;;
        aws)
            aws_machine_action $cloudypad_instance_action $cloudypad_machine_id
            ;;
        *)
            echo "Clouder $cloudypad_clouder is not supported."
            ;;
    esac
}

#
# Paperspace
#

init_paperspace() {

    cloudypad_instance_name=$1
    cloudypad_machine_choice=$2

    check_paperspace_login

    local paperspace_machine_id

    case "$cloudypad_machine_choice" in

        # Prompt user for an existing machine to use
        "$CLOUDYPAD_INIT_USE_EXISTING")
            pspace machine list

            # Check existing machines (TODO again, maybe we can optimize)
            # If only a single machine present, use it as default
            # Fetch the machine list and check if there's only one result
            machine_list=$(pspace machine list --json)
            machine_count=$(echo "$machine_list" | jq '.items | length')

            if [ "$machine_count" -eq 1 ]; then
                default_machine=$(echo "$machine_list" | jq -r '.items[0].id')
                read -p "Enter machine ID to use (default: $default_machine):" paperspace_machine_id
            else
                read -p "Enter machine ID to use:" paperspace_machine_id
            fi

            paperspace_machine_id=${paperspace_machine_id:-$default_machine}
            
            ;;
        "$CLOUDYPAD_INIT_CREATE")
            echo "Sorry, creating Paperspace machine is not yet supported."
            exit 4
            ;;
        *)
            echo "Unknown Paperspace machine selection type $cloudypad_machine_choice. This is probably a bug, please report it."
            exit 5
            ;;
    esac

    echo "Configuring Paperspace machine $paperspace_machine_id."

    paperspace_machine_json=$(pspace machine get $paperspace_machine_id --json)
    
    cloudypad_instance_host=$(echo $paperspace_machine_json | jq '.publicIp' -r)
    cloudypad_instance_user=paperspace

    mkdir -p $(get_cloudypad_instance_dir $cloudypad_instance_name)

    init_ansible_inventory $cloudypad_instance_name $cloudypad_instance_host $cloudypad_instance_user "paperspace" $paperspace_machine_id

    run_update_ansible $cloudypad_instance_name

    echo "Instance $cloudypad_instance_name has been initialized !"
    echo "You can now run moonlight and connect via host $cloudypad_instance_host"
}

# Check if paperspace CLI is logged-in
# A bit hacky as CLI does not provide a "choami" feature
check_paperspace_login () {
    pspace_team_config=$(pspace config get team)

    if [ "$pspace_team_config" == "null" ]; then
        echo "Please login to Paperspace..."
        pspace login
    fi
}


paperspace_machine_action() {
    pspace_action=$1
    pspace_machine=$2

    echo "Paperspace: $pspace_action $pspace_machine"
    pspace machine $pspace_action $pspace_machine
}

#
# AWS
# 

init_aws() {

    local cloudypad_instance_name=$1
    local cloudypad_machine_choice=$2

    check_aws_login

    local aws_instance_id

    case "$cloudypad_machine_choice" in

        # Prompt user for an existing machine to use
        "$CLOUDYPAD_INIT_USE_EXISTING")
            aws ec2 describe-instances --query 'Reservations[*].Instances[*].{Name: Tags[?Key==`Name`].Value | [0], InstanceId: InstanceId, PublicIpAddress: PublicIpAddress, State: State.Name}' --output table

            # Fetch the instance list
            local instance_list=$(aws ec2 describe-instances --query 'Reservations[*].Instances[*].InstanceId' --output json | jq -r '.[][]')
            local instance_count=$(echo "$instance_list" | wc -l)

            if [ "$instance_count" -eq 1 ]; then
                echo "No AWS EC2 instance found. Are you using the correct profile or region ?"
                echo "If needed, set profile or region with:"
                echo "  export AWS_PROFILE=myprofile"
                echo "  export AWS_REGION=eu-central-1"
                exit 7
            fi

            local aws_instance_id=$(prompt_choice "Chose an instance:" $instance_list)

            local aws_instance_json=$(aws ec2 describe-instances --instance-ids $aws_instance_id --query 'Reservations[*].Instances[*]' --output json)
            local cloudypad_instance_host=$(echo $aws_instance_json | jq -r '.[0][0].PublicIpAddress')

            if [ -z "$cloudypad_instance_host" ] || [ "$cloudypad_instance_host" == "null" ]; then
                echo "Error: Instance $aws_instance_id does not have a valid public IP address."
                exit 8
            fi

            read -p "Which user to connect with via SSH ? (eg. 'ec2-user', 'ubuntu', ...): " cloudypad_instance_user
            
            ;;
        "$CLOUDYPAD_INIT_CREATE")
            echo "Sorry, creating AWS instance is not yet supported."
            exit 4
            ;;
        *)
            echo "Unknown AWS instance selection type $cloudypad_machine_choice. This is probably a bug, please report it."
            exit 5
            ;;
    esac

    echo "You're going to initialize Cloudy Pad on AWS EC2:"
    echo "Instance ID: $aws_instance_id"
    echo "Hostname: $cloudypad_instance_host"
    echo "SSH user: $cloudypad_instance_user"
    echo
    echo "Please note:"
    echo " - Setup may take some time, especially GPU driver installation."
    echo " - Machine may reboot several time during process, this is expected and should not cause error."
    echo " - You may be prompted multiple time to validate SSH key fingerprint."

    read -p "Do you want to continue? (y/N): " aws_install_confirm

    if [[ "$aws_install_confirm" != "y" && "$aws_install_confirm" != "Y" ]]; then
        echo "Aborting configuration."
        exit 0
    fi

    mkdir -p $(get_cloudypad_instance_dir $cloudypad_instance_name)

    init_ansible_inventory $cloudypad_instance_name $cloudypad_instance_host $cloudypad_instance_user "aws" $aws_instance_id

    run_update_ansible $cloudypad_instance_name

    echo "Instance $cloudypad_instance_name has been initialized!"
    echo "You can now run moonlight and connect via host $cloudypad_instance_host"
}

check_aws_login() {
    aws sts get-caller-identity > /dev/null
    if [ $? -ne 0 ]; then
        echo "Please configure your AWS CLI with valid credentials."
        exit 1
    fi
}

aws_machine_action() {
    local aws_action=$1
    local aws_instance_id=$2

    case $aws_action in
        start)
            aws ec2 start-instances --instance-ids $aws_instance_id
            ;;
        stop)
            aws ec2 stop-instances --instance-ids $aws_instance_id
            ;;
        restart)
            aws ec2 reboot-instances --instance-ids $aws_instance_id
            ;;
        get)
            aws ec2 describe-instances --instance-ids $aws_instance_id
            ;;
        *)
            echo "Invalid action '$aws_action'. Use start, stop, restart, or status."
            ;;
    esac
}

#
# Ansible
#

# Create an Ansible inventory for CloudyPad configuration
init_ansible_inventory() {

    cloudypad_instance_name=$1
    cloudypad_instance_host=$2
    cloudypad_instance_user=$3
    cloudypad_clouder=$4
    cloudypad_machine_id=$5

    ansible_inventory_path="$(get_cloudypad_instance_ansible_inventory_path $cloudypad_instance_name)"

    echo "Creating Ansible inventory for $cloudypad_instance_name in $ansible_inventory_path"

    cat << EOF > $ansible_inventory_path
all:
  hosts:
    "$cloudypad_instance_name":  # Machine ID in Clouder
      ansible_host: "$cloudypad_instance_host"
      ansible_user: "$cloudypad_instance_user"
  vars:
    cloudypad_clouder: $cloudypad_clouder
    cloudypad_machine_id: $cloudypad_machine_id
    ansible_python_interpreter: auto_silent
EOF

}

run_update_ansible() {
    cloudypad_instance_name=$1

    ansible_inventory=$(get_cloudypad_instance_ansible_inventory_path $cloudypad_instance_name)

    echo "Running Cloudy Pad configuration for $cloudypad_instance_name..."

    ansible-playbook -i $ansible_inventory ansible/playbook.yml
}


# Check if a subcommand is provided
if [ $# -eq 0 ]; then
    usage
fi

# Execute the appropriate function based on the subcommand
case "$1" in
    init)
        init
        ;;
    start)
        instance_stop_start_restart_get "${@:1}"
        ;;
    stop)
        instance_stop_start_restart_get "${@:1}"
        ;;
    restart)
        instance_stop_start_restart_get "${@:1}"
        ;;
    get)
        instance_stop_start_restart_get "${@:1}"
        ;;
    list)
        list
        ;;
    update)
        update "${@:2}"
        ;;
    *)
        usage
        ;;
esac