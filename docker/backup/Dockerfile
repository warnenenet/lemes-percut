FROM alpine:3.20

RUN apk add --no-cache mysql-client gzip tzdata \
  && cp /usr/share/zoneinfo/Asia/Jakarta /etc/localtime \
  && echo "Asia/Jakarta" > /etc/timezone

WORKDIR /scripts
COPY backup.sh /scripts/backup.sh
RUN chmod +x /scripts/backup.sh

# Jadwalkan backup harian pukul 02:00 WIB via crond
RUN echo "0 2 * * * /scripts/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root

CMD ["crond", "-f", "-l", "2"]
