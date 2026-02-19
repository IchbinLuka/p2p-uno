FROM nikolaik/python-nodejs:python3.14-nodejs25

WORKDIR /app

EXPOSE 8000
EXPOSE 8080

RUN mkdir /scripts
COPY <<EOF /scripts/start.sh
#!bin/bash

cd /app/src/p2p_uno/frontend
npm run build

cd /app

uv sync
source .venv/bin/activate

uno-mms --host 0.0.0.0 --port 8000 &
uno-frontend --host 0.0.0.0 --port 8080 --matchmaking-url "http://localhost:8000" &

wait
EOF

RUN chmod +x /scripts/start.sh

CMD ["/bin/bash", "/scripts/start.sh"]
