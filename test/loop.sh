#!/bin/bash
commit="$(git rev-parse --short HEAD)"
counter=0
while [ $? -eq 0 ]
do
((++counter))
echo 'Pass ==================' $counter
#curl -k -d '{"commit":"'${commit}'", "pass":"'${counter}'", "status":"running"}' -H "Content-Type: application/json" -X POST https://10.20.40.41:18443/test-hub
npm test >/dev/shm/test-pass.log 2>/dev/shm/test-error.log
done
#curl -k -d '{"pass":"'${counter}'", "status":"failed"}' -H "Content-Type: application/json" -X POST https://10.20.40.41:18443/test-hub
