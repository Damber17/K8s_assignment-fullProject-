User Management Application on Kubernetes

Overview

This project deploys a Python Flask user management application with PostgreSQL on a local Minikube cluster.
It demonstrates persistent storage, container deployment, hostname routing, health checks and autoscaling.

The application provides a web interface and REST API for creating, viewing, updating and deleting records. 
PostgreSQL stores the records independently of the application Pods.

Technologies:
Python, Flask and Gunicorn
PostgreSQL 15
Docker and Minikube
Kubernetes Deployment, StatefulSet, Services, ConfigMap and Secret
NGINX Ingress, metrics-server, HPA and VPA

Architecture
Requests follow this path:
Browser → Minikube tunnel → NGINX Ingress → API Service → Flask Pods → PostgreSQL

Component

Configuration

Namespace

usermgmt-02230123

Application image

usermgmt-api:1.0

API Deployment

api, initially 2 replicas

API Service

api, port 80 → container port 5000

Database

postgres StatefulSet, 1 replica

Database Service

postgres, headless, port 5432

Storage

1 Gi PersistentVolumeClaim

Hostname

usermgmt-02230123.local

HPA

2–6 API replicas, 50% average CPU target

VPA

PostgreSQL recommendations, update mode Off

Project files

app/
  app.py
  Dockerfile
  requirements.txt
k8s/
  00-namespace.yaml
  10-db-secret.yaml          # Created locally; excluded from Git
  11-db-headless-service.yaml
  12-db-statefulset.yaml
  20-api-configmap.yaml
  21-api-deployment.yaml
  22-api-service.yaml
  30-ingress.yaml
  40-api-hpa.yaml
  41-db-vpa.yaml
.gitignore
README.md

Requirements

Install Docker Desktop, Minikube, kubectl and Git. Start Docker Desktop with Linux containers enabled. The cluster configuration below uses 2 CPUs and 4096 MB RAM.

Run the commands from the project root in PowerShell, except where Git Bash is explicitly stated. Keep additional terminals open for port-forwarding, the tunnel and monitoring.

1. Start the cluster

minikube start --driver=docker --cpus=2 --memory=4096
kubectl config use-context minikube
minikube addons enable ingress
minikube addons enable metrics-server
minikube addons enable storage-provisioner
minikube addons enable default-storageclass
kubectl apply -f k8s/00-namespace.yaml
kubectl config set-context --current --namespace=usermgmt-02230123

Check the platform:

minikube status
kubectl get nodes
kubectl get pods -A
kubectl get ingressclass
kubectl get storageclass
kubectl top nodes

Metrics can take a few minutes to become available.

2. Deploy PostgreSQL

The Secret file is excluded from Git to keep database credentials out of the repository. Create it locally using PowerShell. Enter a local database password when prompted; the command writes it to the ignored file.

$dbPassword = Read-Host 'Enter a database password'
kubectl create secret generic postgres-secret --namespace=usermgmt-02230123 --from-literal=POSTGRES_DB=usermgmt --from-literal=POSTGRES_USER=usermgmt --from-literal="POSTGRES_PASSWORD=$dbPassword" --dry-run=client -o yaml | Set-Content -Encoding utf8 k8s/10-db-secret.yaml
Remove-Variable dbPassword
kubectl apply -f k8s/10-db-secret.yaml
kubectl apply -f k8s/11-db-headless-service.yaml
kubectl apply -f k8s/12-db-statefulset.yaml
kubectl rollout status statefulset/postgres --timeout=180s
kubectl get pods,pvc,svc

The postgres-0 Pod should be ready and its PVC should be Bound. Keep DB_NAME in the API ConfigMap consistent with POSTGRES_DB.

PostgreSQL uses these credentials when initialising an empty data directory. Changing the Secret later does not change the password already stored in an existing database.

3. Build and deploy the application

Build the image directly inside Minikube so that both the API container and its schema initialisation container can use it:

minikube image build -t usermgmt-api:1.0 ./app
kubectl apply -f k8s/20-api-configmap.yaml
kubectl apply -f k8s/21-api-deployment.yaml
kubectl apply -f k8s/22-api-service.yaml
kubectl rollout status deployment/api --timeout=180s
kubectl get deploy,pods,svc

The init container prepares the database table before the application starts. Application settings come from api-config and postgres-secret.

For direct local access, run:

kubectl port-forward svc/api 8080:80

Keep this terminal open and visit http://localhost:8080.

4. Configure hostname access

kubectl apply -f k8s/30-ingress.yaml
kubectl get ingress
kubectl describe ingress usermgmt-ingress

Open Notepad as Administrator and edit:

C:\Windows\System32\drivers\etc\hosts

Add this line once:

127.0.0.1 usermgmt-02230123.local

Flush the DNS cache:

ipconfig /flushdns

In a separate terminal, run the tunnel and allow administrator access if requested:

minikube tunnel

Keep the tunnel running. Open:

http://usermgmt-02230123.local

Check the route and health endpoints:

curl.exe -i http://usermgmt-02230123.local/healthz
curl.exe -i http://usermgmt-02230123.local/ready
curl.exe -i http://usermgmt-02230123.local/users
curl.exe -i -H "Host: wrong-host.local" http://127.0.0.1/

The health and readiness checks should return HTTP 200 when the application and database are available. The unmatched hostname should return the NGINX default HTTP 404.

5. Test the REST API

Method

Endpoint

Purpose

GET

/

Open the web interface

GET

/users

List records

POST

/users

Create a record

GET

/users/{id}

Retrieve one record

PUT

/users/{id}

Update a record

DELETE

/users/{id}

Delete a record

GET

/healthz

Application liveness

GET

/ready

Database-dependent readiness

The following PowerShell example uses the name and email fields in the supplied API. Use a fresh email address each time you run it.

$base = 'http://usermgmt-02230123.local'
$body = @{ name = 'Test User'; email = 'test.user@example.com' } | ConvertTo-Json
$user = Invoke-RestMethod -Method Post -Uri "$base/users" -ContentType 'application/json' -Body $body
$user
Invoke-RestMethod -Uri "$base/users"
Invoke-RestMethod -Uri "$base/users/$($user.id)"
$updated = @{ name = 'Updated User'; email = 'updated.user@example.com' } | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri "$base/users/$($user.id)" -ContentType 'application/json' -Body $updated
Invoke-RestMethod -Method Delete -Uri "$base/users/$($user.id)"

Creation returns HTTP 201. Missing required values return 400, duplicate email addresses return 409, and an unknown record ID returns 404. If using an extended student-management version, include any additional required fields defined in that version of app.py.

6. Verify database persistence

Create a separate test table and insert a record:

kubectl exec postgres-0 -- psql -U usermgmt -d usermgmt -c "CREATE TABLE IF NOT EXISTS persistence_test (student_id TEXT PRIMARY KEY); INSERT INTO persistence_test VALUES ('02230123') ON CONFLICT DO NOTHING;"
kubectl exec postgres-0 -- psql -U usermgmt -d usermgmt -c "SELECT * FROM persistence_test;"
kubectl get pod postgres-0 -o custom-columns=NAME:.metadata.name,UID:.metadata.uid
kubectl get pvc

Delete the database Pod and wait for the StatefulSet to recreate it:

kubectl delete pod postgres-0
kubectl rollout status statefulset/postgres --timeout=180s
kubectl get pod postgres-0 -o custom-columns=NAME:.metadata.name,UID:.metadata.uid
kubectl get pvc
kubectl exec postgres-0 -- psql -U usermgmt -d usermgmt -c "SELECT * FROM persistence_test;"

The replacement Pod should have a different UID while the PVC and test record remain available.

7. Enable horizontal autoscaling

kubectl apply -f k8s/40-api-hpa.yaml
kubectl get hpa
kubectl describe hpa api-hpa

The HPA scales the API between 2 and 6 replicas using a 50% average CPU utilisation target. The API container requests 100m CPU, which provides the baseline for that percentage.

If the hey load-testing executable is available at tools/hey.exe, run:

.\tools\hey.exe -z 5m -c 50 http://usermgmt-02230123.local/users

In another terminal, record status every 30 seconds during and after the load test. Press Ctrl+C to stop recording.

New-Item -ItemType Directory -Force evidence | Out-Null
& {
    while ($true) {
        Get-Date -Format o
        kubectl get hpa api-hpa
        kubectl get deployment api
        kubectl top pods -l app=api
        Start-Sleep -Seconds 30
    }
} 2>&1 | Tee-Object -FilePath evidence/hpa-log.txt

Observe scale-up under sufficient load and scale-down after load stops. Scaling depends on measured CPU usage and controller delays; it is not immediate. The assignment report recorded 2 → 6 → 2 replicas.

8. Enable PostgreSQL VPA recommendations

VPA requires its CRDs and controllers in addition to the project manifest. If VPA is not already installed, clone the upstream autoscaler repository into a separate tools directory and run its installer in Git Bash, with kubectl using the Minikube context:

git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler
./hack/vpa-up.sh

Return to the project root in PowerShell:

kubectl get pods -n kube-system
kubectl apply -f k8s/41-db-vpa.yaml
kubectl get vpa
kubectl describe vpa postgres-vpa

Allow time for metrics to accumulate. The VPA targets the PostgreSQL StatefulSet and uses Off mode, so it recommends CPU and memory requests without automatically applying them.

The HPA manages API replica counts while the VPA evaluates database resource sizing. Keeping them on different workloads avoids having both controllers change the API's CPU-based scaling behaviour.

Troubleshooting

Problem

Checks and action

PowerShell command is not recognised

Run it in PowerShell. Commands such as New-Item do not work in Command Prompt.

ImagePullBackOff or Init:ImagePullBackOff

Describe the failing Pod and inspect Events. Confirm the image tag matches the manifest and build it inside Minikube.

API Pods are not ready

Check API and init-container logs, database readiness, ConfigMap and Secret values.

Browser cannot reach the hostname

Check the hosts entry, running tunnel, Ingress controller and ready API endpoints.

Ingress returns 503

Check API readiness and Service selectors/endpoints.

HPA shows unknown metrics

Check metrics-server, kubectl top pods and API CPU requests; allow metrics time to appear.

PVC stays Pending

Check the default StorageClass and Minikube storage add-ons.

VPA resource is not recognised

Install VPA CRDs and controllers before applying 41-db-vpa.yaml.

Useful diagnostic commands:

kubectl get deploy,sts,pods,svc,ingress,pvc,hpa
kubectl get endpoints api
kubectl get events --sort-by=.metadata.creationTimestamp
kubectl logs deployment/api -c api
kubectl logs deployment/api -c init-schema
kubectl logs postgres-0
kubectl get pods -n ingress-nginx

For detailed Pod events, replace POD_NAME below with a name from kubectl get pods:

kubectl describe pod POD_NAME

After rebuilding an image under the same local tag, restart the API Pods:

minikube image build -t usermgmt-api:1.0 ./app
kubectl rollout restart deployment/api
kubectl rollout status deployment/api --timeout=180s

Stop or remove the project

To stop the cluster temporarily:
minikube stop

