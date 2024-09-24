# Cloudy Pad

Cloudy Pad lets you deploy a Cloud gaming server anywhere in the world and play your own games - without requiring a powerful gaming machine or a costly subscription:

- Compatible with **[Moonlight](https://moonlight-stream.org/)** streaming client
- Use **Spot instances** for up to **90% cheaper** instances with some Clouders
- Play **30 hours per month** for **~15$ / month or less**
- **Pay by the hour** on various Cloud providers (AWS, Google, Azure...)
- Play your own **Steam** (and other) games

![](docs/src/assets/cloudypad-overview.png)

**[📜 See full documentation](https://cloudypad.gg)**

**Not familiar with Cloud Gaming ?** See [What's Cloud Gaming and how is Cloudy Pad useful ?](./docs/src/what-is-cloud-gaming.md)

---

- [Development status 🧪](#development-status-)
- [Features ✨](#features-)
- [Getting started 🚀](#getting-started-)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Cloud provider setup](#cloud-provider-setup)
  - [Deploy your instance !](#deploy-your-instance-)
  - [Play your game](#play-your-game)
  - [Stop your instance after gaming sessions](#stop-your-instance-after-gaming-sessions)
  - [Problem ?](#problem-)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Development status 🧪

This project is still at an experimental phase. While working and allowing you to play in the Cloud seamlessly, there may be breaking changes in the future. **Your feedback, bug reports and contribution will be greatly appreciated !**

## Features ✨

Main features:

- Compatible with **[Moonlight](https://moonlight-stream.org/)** streaming client
- Use **Spot instances** for up to **90% cheaper** instances with some Clouders
- Play **30 hours per month** for **~15$ / month or less**
- **Pay by the hour** on various Cloud providers (AWS, Google, Azure...)
- Play your own **Steam** (and other) games

Available Cloud providers:

- [Paperspace](https://www.paperspace.com/)
- [Google Cloud](https://cloud.google.com)
- [Azure](https://azure.microsoft.com)
- [AWS](https://aws.amazon.com/)

## Getting started 🚀

Not familiar with terms like _"Cloud gaming"_, _"Moonlight"_, _"Cloud Provider"_ _"terminal"_ or _"CLI"_ ? Visit [What's Cloud Gaming and how is Cloudy Pad useful ?](https://cloudypad.gg/what-is-cloud-gaming) first 😉

### Prerequisites

- A Cloud provider account, one of:
  - AWS
  - Azure
  - Google Cloud
  - Paperspace
- [Moonlight](https://moonlight-stream.org/) streaming client
- [Docker](https://docs.docker.com/engine/install/) 
  - Rootless Docker is not supported yet
  - For MacOS, [OrbStack](https://orbstack.dev/) is recommended over Docker Desktop

### Installation 

Install latest version of `cloudypad` CLI:

```sh
curl -fsSL https://raw.githubusercontent.com/PierreBeucher/cloudypad/master/install.sh | sh
```

For other installation methods, see [Installation](https://cloudypad.gg/usage/installation)

### Cloud provider setup

You may need to setup a few things on your Cloud provider (eg. API key or SSH key). Checkout [per-Clouder setup specifities](https://cloudypad.gg/cloud-provider-setup).

### Deploy your instance !

Once ready, create your instance with `cloudypad` CLI:

```sh
cloudypad create
# How shall we name your Cloudy Pad instance? (default: mypad) 
#
# Creating Cloudy Pad instance 'mypad'
#
# [...]
#
# 🥳 Your Cloudy Pad instance is ready !
```

Cloudy Pad will:
- Create a new Cloud machine and related configurations automatically (you can also use an existing machine)
- Install GPU drivers and [Wolf gaming server](https://games-on-whales.github.io/wolf/stable/)
- Help your Pair with Moonlight

### Play your game

Run Moonlight and connect to your instance. Run Steam, login, install your game and enjoy.

To connect with Steam, either:
- Type your login and password directly
- Use Steam smartphone app and scan QR code (run Steam app, log in to your account and click on shield button at the bottom) 

### Stop your instance after gaming sessions

Once you are done, **remember to stop your instance to avoid unnecessary costs 💸**

```sh
cloudypad stop mypad
# or 
# cloudypad destroy mypad
```

### Problem ?

😱 Something went wrong? See [FAQ and known issues](https://cloudypad.gg/usage/faq.md) or [create an issue](https://github.com/PierreBeucher/cloudypad/issues)

## Documentation

[📜 See full documentation](https://cloudypad.gg)

## Contributing

See [development guide](https://cloudypad.gg/development-guide)

## License

Cloudy Pad is licensed under [GNU General Public License v3.0](https://github.com/PierreBeucher/cloudypad/blob/master/LICENSE.txt)