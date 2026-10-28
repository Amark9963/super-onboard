FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
COPY app ./app
RUN pip install --no-cache-dir --no-deps '.[dev]'
COPY . .
# Run as an unprivileged user: the API and worker never need to write to the image.
RUN useradd --system --no-create-home --uid 10001 onboard && chown -R onboard /app
USER onboard
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
