FROM nikolaik/python-nodejs:python3.14-nodejs25

WORKDIR /app

COPY . /app

EXPOSE 8000
EXPOSE 8001
EXPOSE 8080

RUN uv sync

RUN mkdir /local1 && mkdir /local2
RUN uv run uno-mms gen-keypair --out /local1/key.priv --pub /local1/key.pub
RUN uv run uno-mms gen-keypair --out /local2/key.priv --pub /local2/key.pub

WORKDIR /app/src/p2p_uno/frontend
RUN npm install
RUN npm run build

RUN mkdir /scripts
COPY <<EOF /scripts/mm_config.yaml
local1:
    name: Local 1
    url: localhost:8000
    secure: false
    public_key: /local1/key.pub
local2:
    name: Local 2
    url: localhost:8001
    secure: false
    public_key: /local2/key.pub
EOF

COPY <<EOF /scripts/start.sh
#!/bin/bash

cd /app

uv run uno-mms start --host 0.0.0.0 --port 8000 --key /local1/key.priv &
uv run uno-mms start --host 0.0.0.0 --port 8001 --key /local2/key.priv &
uv run uno-frontend --host 0.0.0.0 --port 8080 --matchmaking-config /scripts/mm_config.yaml &

wait
EOF

RUN chmod +x /scripts/start.sh

CMD ["/bin/bash", "/scripts/start.sh"]
