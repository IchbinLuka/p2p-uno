FROM nikolaik/python-nodejs:python3.14-nodejs25

WORKDIR /app

COPY . /app

EXPOSE 8000
EXPOSE 8001
EXPOSE 8080

RUN uv sync

WORKDIR /app/src/p2p_uno/frontend
RUN npm install
RUN npm run build

RUN mkdir /scripts
COPY <<EOF /scripts/mm_config.yaml
local1:
    name: Local 1
    url: localhost:8000
    secure: false
local2:
    name: Local 2
    url: localhost:8001
    secure: false
EOF

COPY <<EOF /scripts/start.sh
#!/bin/bash

cd /app

uv run uno-mms --host 0.0.0.0 --port 8000 &
uv run uno-mms --host 0.0.0.0 --port 8001 &
uv run uno-frontend --host 0.0.0.0 --port 8080 --matchmaking-config /scripts/mm_config.yaml &

wait
EOF

RUN chmod +x /scripts/start.sh

CMD ["/bin/bash", "/scripts/start.sh"]
