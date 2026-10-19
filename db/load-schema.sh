#!/bin/sh
# Runs inside the usangtak-erd-mysql container (copied by start-erd-mysql.ps1).
# usage: sh /tmp/load-schema.sh ping | load | count
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
case "$1" in
  ping)  mysql -uroot -e "select 1" "$MYSQL_DATABASE" >/dev/null ;;
  load)  mysql --default-character-set=utf8mb4 -uroot "$MYSQL_DATABASE" < /tmp/schema.sql ;;
  count) mysql -N -uroot -e "select (select count(*) from information_schema.tables where table_schema=database()), (select count(*) from information_schema.referential_constraints where constraint_schema=database())" "$MYSQL_DATABASE" ;;
esac
