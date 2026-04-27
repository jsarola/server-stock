FROM python:3.12-slim

WORKDIR /app

# Install poetry and configure it to install into the system (no virtualenv)
RUN pip install --no-cache-dir poetry && \
    poetry config virtualenvs.create false

# Copy dependency files first to benefit from layer cache
COPY pyproject.toml poetry.lock ./

# Install only runtime dependencies
RUN poetry install --only main --no-interaction --no-ansi

# Copy application code
COPY server_stock/ ./server_stock/
COPY public/ ./public/

EXPOSE 3000

CMD ["python", "-c", "from server_stock.app import main; main()"]
