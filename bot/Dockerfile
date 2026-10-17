FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /srv/bot

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Бот не нуждается в root: сеть наружу, файлов не пишет
RUN useradd --system --no-create-home bot
USER bot

CMD ["python", "-m", "app"]
