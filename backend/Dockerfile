FROM python:3.10.6

WORKDIR /app

COPY requirements.txt .
RUN pip3 install -r requirements.txt

COPY src/ ./src/

ENTRYPOINT ["uvicorn", "src.app:app", "--reload", "--port=8081"]
