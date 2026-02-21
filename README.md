# P2P Uno

This repository contains the source code for the project in Distributed Systems at Unibo.

## Getting started

### Docker

We provide a docker image for quick setup and deployment.
After cloning the repository, simply run the following command in the project root directory:

```bash
docker-compose run --build
```

Now the frontend should be available under [http://localhost:8080](http://localhost:8080).

### Manual Setup

Requirements:

- git
- [uv](https://docs.astral.sh/uv/)
- [npm](https://www.npmjs.com/) or similar

1. Clone the repository
2. Run `uv sync`
3. Compile the frontend package:

```bash
cd src/p2p_uno/frontend
npm install && npm run build
```

4. Generate a keypair for the matchmaking server:

```bash
uv run uno-mms gen-keypair --out key.priv --pub key.pub
```

5. Start the matchmaking server

```bash
uv run uno-mms start --host 0.0.0.0 --port 8000
```

6. Create a matchmaking server config file containing all the running matchmaking servers. An example configuration can be found in [mm_server_config_example.yaml](mm_server_config_example.yaml).

```yaml
test_instance:
    name: Local 1
    url: localhost:8000
    secure: false
    public_key: ./key.pub
```

7. Start a server instance that servers the frontend:

```bash
uv run uno-frontend --host 0.0.0.0 --port 8080 --matchmaking-config mm_config.yaml
```

Now the user interface is available under [http://localhost:8080](http://localhost:8080).

## Project Structure

This project is structured as a top-level python project that is managed by uv.
The [src](src) directory contains all the source code of the application.
The code for the frondend and peer implementation for the games can be found as an npm project in [src/p2p_uno/frontend](src/p2p_uno/frontend).
