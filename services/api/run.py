import os
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("CIVICWATCH_HOST", "127.0.0.1"),
        port=int(os.getenv("CIVICWATCH_PORT", "8000")),
        reload=os.getenv("CIVICWATCH_RELOAD", "0") == "1",
    )
