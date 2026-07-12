# FileInNOut Quickstart

`quickstart.ps1` starts a complete local FileInNOut stack with Docker Compose.

```powershell
.\quickstart.ps1
```

The first execution creates `deploy/quickstart/.env` with random local-only
secrets, builds the application images, starts MariaDB, Redis, MinIO, backend,
realtime gateway, and frontend, waits for health checks, then prints the URL and
initial administrator account.

## Requirements

- Windows PowerShell 5.1 or PowerShell 7
- Docker Desktop running with Docker Compose v2
- Free local ports: `8088`, `9000`, `9001`
- Internet access for the first container and dependency build

## Commands

```powershell
# Start or update the local stack.
.\quickstart.ps1

# Use a different browser port or LAN hostname.
.\quickstart.ps1 -AppPort 8090 -PublicHost 192.168.0.20

# Show Compose service status.
.\quickstart.ps1 -Action Status

# Stop containers and keep data.
.\quickstart.ps1 -Action Stop

# Remove containers and all local Docker volumes.
.\quickstart.ps1 -Action Reset
```

`Reset` deletes the local MariaDB, Redis, and MinIO volumes. It keeps the local
`.env` file so the administrator account configuration remains available.

## Local endpoints

| Service | Default URL |
| --- | --- |
| FileInNOut | `http://localhost:8088` |
| Backend health | `http://localhost:8088/api/actuator/health` |
| Realtime status | `http://localhost:8088/wss/statusz` |
| MinIO API | `http://localhost:9000` |
| MinIO console | `http://localhost:9001` |

The generated `.env` is ignored by Git. Do not reuse its generated secrets for
Kubernetes or production deployments.