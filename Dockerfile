ARG NODE_VERSION="20.16.0-bookworm-slim"
FROM node:${NODE_VERSION} AS build

RUN apt update && apt install -y \
    curl \
    unzip 

#
# Pulumi (can be copied from /usr/local/bin/pulumi/)
#
FROM build AS pulumi

ARG PULUMI_VERSION="v3.124.0"
ARG TARGETPLATFORM
RUN case "$TARGETPLATFORM" in \
      "linux/amd64") \
        curl "https://get.pulumi.com/releases/sdk/pulumi-${PULUMI_VERSION}-linux-x64.tar.gz" -o pulumi.tar.gz ;; \
      "linux/arm64") \
        curl "https://get.pulumi.com/releases/sdk/pulumi-${PULUMI_VERSION}-linux-arm64.tar.gz" -o pulumi.tar.gz ;; \
      *) \
        echo "Unsupported platform: $TARGETPLATFORM" && exit 1 ;; \
    esac \
    && tar -xzf pulumi.tar.gz -C /usr/local/bin \
    && rm pulumi.tar.gz

#
# Cloudy Pad
#

# Compile Typescript code in dedicated image to avoid dev dependencies in final image
FROM build AS tsc

WORKDIR /build

COPY package.json       package.json
COPY package-lock.json  package-lock.json
RUN npm install

# ansible required for build as packaged with node code
COPY ansible ansible
COPY src src
COPY LICENSE.txt tsconfig.json ./

RUN npm run build

# 
# Final Cloudypad image
#
FROM node:${NODE_VERSION}

# Global tooling
RUN apt update && apt install -y \
    python3 \
    ansible \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Required for Azure DefaultAzureCredential
RUN curl -sL https://aka.ms/InstallAzureCLIDeb -o install.sh && chmod +x install.sh && ./install.sh -y

# Pulumi
COPY --from=pulumi /usr/local/bin/pulumi /usr/local/bin/pulumi
ENV PATH=$PATH:/usr/local/bin/pulumi

# Build and install cloudypad CLI
WORKDIR /cloudypad

# Ansible deps
# Install globally under /etc/ansible
COPY ansible/requirements.yml ansible/requirements.yml
RUN ansible-galaxy role install -r ansible/requirements.yml -p /usr/share/ansible/roles
RUN ansible-galaxy collection install -r ansible/requirements.yml -p /usr/share/ansible/collections

# Shorter Ansible logs output
ENV ANSIBLE_STDOUT_CALLBACK=community.general.unixy

# Deps
ENV NODE_ENV=production
COPY package.json       package.json
COPY package-lock.json  package-lock.json
RUN npm ci --omit dev

# Copy built app directly
COPY --from=tsc /build/dist dist/
COPY LICENSE.txt .

RUN npm install --global

ENTRYPOINT  ["cloudypad"]