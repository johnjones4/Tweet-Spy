#!/bin/bash
APP_NAME=tweetspy
CUR_DIR=$(pwd)
case "$1" in
  start)
  mkdir "$CUR_DIR"/log
  exec forever --sourceDir="$CUR_DIR" --uid "$APP_NAME" -p /var/run/forever --pidFile "$APP_NAME".pid -o "$CUR_DIR"/log/"$APP_NAME".log -e "$CUR_DIR"/log/"$APP_NAME".err.log -l "$CUR_DIR"/log/forever.log -a start index.js
  ;;

  stop)
  exec forever stop "$APP_NAME"
  ;;
esac

exit 0
