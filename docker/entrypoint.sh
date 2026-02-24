#!/bin/sh
# Shared entrypoint for API and Worker containers.
# Sources S3 credentials from the shared volume (written by garage-init)
# before launching the main process.

if [ -f /shared/s3-credentials.env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      \#*|"") continue ;;
      *=*) export "$line" ;;
    esac
  done < /shared/s3-credentials.env
fi

exec "$@"
