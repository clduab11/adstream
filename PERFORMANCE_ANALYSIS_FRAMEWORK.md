# ADSTREAM Ad Server - Detailed Performance Analysis Framework

**Document Purpose:** Specific code patterns, file locations, and analysis procedures for comprehensive performance assessment once code is committed.

---

## ANALYSIS FRAMEWORK: WHAT TO SEARCH FOR IN CODE

### 1. DATABASE LAYER ANALYSIS

#### File Patterns to Search
```
Files to find:
- **/*.py (if Python)
- **/models/* or **/db/* or **/database/*
- **/migrations/* or **/alembic/*
- **/*config*.py with database settings
- **/*orm*.py or **/*sqlalchemy*.py
- **/queries.py or **/query*.py
```

#### Code Patterns to Search For

**PROBLEM: N+1 Queries**
```python
# ANTI-PATTERN - Search for this (bad):
for ad in ads:
    ad.campaign = get_campaign(ad.campaign_id)  # Query in loop!

# GOOD PATTERN - Look for this:
campaigns = get_campaigns_batch(ad_ids)
```

Search Pattern: `for .* in .*:\n.*\.get\(.*\)`

**PROBLEM: Missing Indexes**
```python
# Look for:
class Ad(Base):
    __tablename__ = "ads"
    id = Column(Integer, primary_key=True)
    campaign_id = Column(Integer)  # Should have index!
    targeting_geo = Column(String)  # Should have index!
    active = Column(Boolean, default=True)  # Should have index!

# Missing indexes on filtering columns!
```

Search Pattern: `Column\(.*\)` without `index=True`

**PROBLEM: Query Performance**
```python
# Look for expensive queries:
query = db.query(Ad).filter(Ad.active == True).all()  # No LIMIT!
query = db.query(Ad).join(Campaign).join(Targeting).all()  # Multiple joins without LIMIT

# Should be:
query = db.query(Ad).filter(Ad.active == True).limit(100).all()
```

Search Pattern: `\.all\(\)` without limit clause before it

#### Analysis Checklist

- [ ] Find all database model definitions
  - Expected location: `/src/models/` or `/app/models/`
  - Check for missing indexes on foreign keys and filter columns
  
- [ ] Find all query builders
  - Expected location: `/src/services/` or `/app/database/`
  - Check for N+1 patterns
  
- [ ] Check ORM configuration
  - Expected location: `/src/server/config.py` or similar
  - Look for `SQLALCHEMY_ECHO`, connection pool settings
  
- [ ] Find query execution helpers
  - Search for `query()`, `execute()`, `fetch()` functions
  - Identify which queries run frequently
  
- [ ] Check for prepared statements
  - Search for parameterized queries vs. string concatenation

#### Performance Metrics to Track
```
Metric: Average query execution time
- Goal: < 50ms for ad selection
- Measurement: Use EXPLAIN ANALYZE

Metric: Index hit rate
- Goal: > 95% of queries use indexes
- Measurement: PostgreSQL pg_stat_statements

Metric: Connection utilization
- Goal: 60-80% utilization of pool
- Measurement: Monitor connection pool size

Metric: Slow query log
- Goal: 0 queries taking > 100ms for ad serving
- Measurement: Enable slow_query_log
```

---

### 2. CACHING LAYER ANALYSIS

#### File Patterns to Search
```
Files to find:
- **/cache.py or **/caching.py or **/redis*.py
- **/*config*.py (Redis configuration)
- **/services/*.py (cache usage)
- **/*decorators*.py (cache decorators)
- docker-compose.yaml (Redis service definition)
```

#### Code Patterns to Search For

**GOOD: Redis Integration**
```python
# GOOD PATTERN - Look for:
from redis import Redis
cache = Redis(host='localhost', port=6379, decode_responses=True)

@cache_key('ads:{ad_id}')
def get_ad(ad_id):
    return db.query(Ad).filter(Ad.id == ad_id).first()
```

**PROBLEM: No Caching**
```python
# BAD PATTERN - Search for this:
def get_ad(ad_id):
    return db.query(Ad).filter(Ad.id == ad_id).first()  # Every request hits database!
```

**PROBLEM: Cache Stampede**
```python
# ANTI-PATTERN:
if not cache.exists('ads'):
    ads = db.query(Ad).all()  # All threads might do this!
    cache.set('ads', ads)
```

**GOOD: Cache Stampede Prevention**
```python
# GOOD PATTERN:
ads = cache.get_or_set('ads', timeout=300)
# Or with explicit lock
with cache.get_lock('ads:load', timeout=10):
    if not cache.exists('ads'):
        ads = db.query(Ad).all()
        cache.set('ads', ads)
```

#### Cache Configuration Checklist

- [ ] Identify all cacheable data
  - Ad templates
  - Campaign metadata
  - Targeting data
  - RTB exchange credentials
  
- [ ] Check cache invalidation strategy
  - TTL configuration
  - Manual invalidation on updates
  - Partial invalidation patterns
  
- [ ] Verify cache key design
  - Consistent key naming
  - Namespace segregation
  - Version prefixes
  
- [ ] Multi-level caching setup
  - Redis (distributed cache)
  - Local in-memory cache
  - HTTP cache headers
  
- [ ] Cache monitoring
  - Hit/miss ratios
  - Memory usage
  - Eviction policy (should be allkeys-lru)

#### Cache Performance Targets
```
Metric: Cache hit rate
- Goal: > 80% for ad data
- Measurement: redis.info('stats')['keyspace_hits'] / total_ops

Metric: Cache miss handling
- Goal: Fallback to database should complete in < 100ms
- Measurement: Slow query log

Metric: Cache invalidation latency
- Goal: < 100ms from update to cache invalidation
- Measurement: Application metrics

Metric: Memory usage
- Goal: < 500MB for cache cluster (adjust based on data size)
- Measurement: redis.info('memory')['used_memory_human']
```

---

### 3. CONNECTION POOLING ANALYSIS

#### File Patterns to Search
```
Files to find:
- **/*config*.py (pool configuration)
- **/*db*.py or **/database.py (connection setup)
- **/*pool*.py
- **/*client*.py (HTTP client setup)
- docker-compose.yaml (service definitions)
```

#### Code Patterns to Search For

**DATABASE CONNECTION POOLING**

```python
# GOOD PATTERN - SQLAlchemy with pooling:
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,           # Connections to keep in pool
    max_overflow=40,        # Additional connections allowed
    pool_recycle=3600,      # Recycle connections after 1 hour
    pool_pre_ping=True,     # Test connection before use
)
```

**REDIS CONNECTION POOLING**

```python
# GOOD PATTERN:
from redis import ConnectionPool, Redis

pool = ConnectionPool(
    host='localhost',
    port=6379,
    max_connections=50,
    decode_responses=True
)
redis_client = Redis(connection_pool=pool)
```

**HTTP CLIENT POOLING**

```python
# GOOD PATTERN:
import aiohttp

async def create_session():
    connector = aiohttp.TCPConnector(
        limit=100,              # Total connection limit
        limit_per_host=30,      # Per-host limit
        ttl_dns_cache=300,
    )
    return aiohttp.ClientSession(connector=connector)

# ANTI-PATTERN - Search for this (bad):
import requests
for exchange in exchanges:
    response = requests.get(exchange_url)  # New connection each time!
```

#### Connection Pool Configuration Checklist

- [ ] Database connection pool
  - Pool size should match expected concurrent requests
  - Overflow size for spikes
  - Connection recycling for connection timeout issues
  - Pre-ping enabled to avoid stale connections
  
- [ ] Redis connection pool
  - Connection limit configuration
  - Idle timeout handling
  
- [ ] HTTP client pool
  - Connection limit per host
  - Connection reuse
  - DNS caching
  
- [ ] Connection monitoring
  - Current pool utilization
  - Connection wait times
  - Pool exhaustion events

#### Pool Performance Targets
```
Metric: Pool utilization
- Goal: 60-80% average utilization
- Too low: Wasting memory
- Too high: Potential exhaustion
- Measurement: Monitor active connections

Metric: Connection wait time
- Goal: < 10ms average
- Measurement: Application metrics

Metric: Pool exhaustion events
- Goal: 0 events per hour
- Measurement: Error logs for "connection pool exhausted"

Metric: Stale connections
- Goal: 0 reconnects per second
- Measurement: Connection errors in logs
```

---

### 4. ASYNC/CONCURRENT PROCESSING ANALYSIS

#### File Patterns to Search
```
Files to find:
- **/app.py (main application file)
- **/*routes*.py or **/*endpoints*.py
- **/*async*.py or **/*worker*.py
- **/celery.py or **/*task*.py
- **/*event*.py (event handlers)
- docker-compose.yaml (worker services)
- requirements.txt or pyproject.toml (async libraries)
```

#### Code Patterns to Search For

**GOOD: Async Request Handling**
```python
# GOOD PATTERN - FastAPI async:
from fastapi import FastAPI

app = FastAPI()

@app.get("/ads")
async def get_ads(ad_id: int):
    # Async database query
    ad = await get_ad_async(ad_id)
    # Parallel RTB requests
    bids = await asyncio.gather(
        query_exchange_1(ad),
        query_exchange_2(ad),
        query_exchange_3(ad),
        timeout=100
    )
    return select_best_bid(bids)
```

**ANTI-PATTERN: Synchronous I/O**
```python
# BAD PATTERN - Search for this:
@app.get("/ads")
def get_ads(ad_id: int):  # Synchronous!
    ad = db.query(Ad).filter(Ad.id == ad_id).first()  # Blocks!
    bid1 = requests.get(exchange1_url).json()  # Blocks!
    bid2 = requests.get(exchange2_url).json()  # Blocks!
    # If exchange1 takes 100ms, whole request takes 200ms+
    return select_best_bid([bid1, bid2])
```

**GOOD: Async RTB Requests**
```python
# GOOD: Parallel requests with timeout
async def get_bids(ad, timeout=100):
    try:
        bids = await asyncio.wait_for(
            asyncio.gather(
                fetch_bid(exchange1, ad),
                fetch_bid(exchange2, ad),
                fetch_bid(exchange3, ad),
            ),
            timeout=timeout/1000  # Convert to seconds
        )
        return bids
    except asyncio.TimeoutError:
        return get_fallback_bids()
```

**BACKGROUND TASK PROCESSING**

```python
# GOOD PATTERN - Celery tasks:
from celery import Celery

celery = Celery('adstream')

@celery.task
def process_impression(impression_data):
    # Run asynchronously, don't block ad serving
    save_impression_to_db(impression_data)
    update_budget(impression_data)
    send_to_analytics(impression_data)
```

#### Concurrency Analysis Checklist

- [ ] Identify all I/O operations
  - Database queries
  - External API calls (RTB exchanges)
  - Cache lookups
  - File operations
  - Search for: `requests.`, `db.query()`, `redis.get()`, `open()`
  
- [ ] Check async/await usage
  - Should use `async def` for all I/O endpoints
  - Should use `await` for all I/O operations
  - Should NOT have `requests` or `db.query()` without async wrapper
  
- [ ] Identify blocking operations
  - CPU-intensive calculations
  - Large file I/O
  - Encoding/decoding operations
  
- [ ] Check task queuing
  - Celery or similar for background work
  - Proper priority configuration
  - Worker pool size and concurrency settings
  
- [ ] Verify error handling
  - Timeouts on external API calls
  - Fallback behavior when API fails
  - Graceful degradation

#### Concurrency Performance Targets
```
Metric: Request concurrency
- Goal: > 1000 concurrent requests per instance
- Measurement: Load testing with concurrent clients

Metric: Async operation latency
- Goal: RTB requests complete within 100ms
- Measurement: Request timing logs

Metric: Background task latency
- Goal: Impressions processed within 1 second
- Measurement: Task processing time

Metric: Worker utilization
- Goal: 70-90% busy
- Measurement: Worker statistics
```

---

### 5. LOAD BALANCING CONFIGURATION

#### File Patterns to Search
```
Files to find:
- nginx.conf or **/nginx/** (Nginx config)
- haproxy.cfg or **/haproxy/** (HAProxy config)
- **/kubernetes/** or **/*deploy*.yaml (K8s manifests)
- docker-compose.yaml (container orchestration)
- .dockerignore, Dockerfile
- **/load_balancer/** or **/proxy/**
```

#### Code Patterns to Search For

**NGINX CONFIGURATION**

```nginx
# GOOD PATTERN - Round-robin load balancing:
upstream adserver {
    least_conn;  # OR: round_robin (default)
    server 10.0.0.1:8000 weight=1;
    server 10.0.0.2:8000 weight=1;
    server 10.0.0.3:8000 weight=1;
    
    # Health check configuration
    check interval=3000 rise=2 fall=5 timeout=1000 type=http;
    check_http_send "GET /health HTTP/1.0\r\n\r\n";
    check_http_expect_alive http_2xx;
    
    keepalive 32;  # Connection reuse
}

server {
    listen 80;
    server_name adserver.example.com;
    
    location /ads {
        proxy_pass http://adserver;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_connect_timeout 5s;
        proxy_send_timeout 5s;
        proxy_read_timeout 5s;
    }
}
```

**KUBERNETES LOAD BALANCING**

```yaml
# GOOD PATTERN:
apiVersion: v1
kind: Service
metadata:
  name: adserver-service
spec:
  type: LoadBalancer
  sessionAffinity: ClientIP  # If needed for session stickiness
  selector:
    app: adserver
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8000
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: adserver
spec:
  replicas: 3
  selector:
    matchLabels:
      app: adserver
  template:
    metadata:
      labels:
        app: adserver
    spec:
      containers:
      - name: adserver
        image: adserver:latest
        ports:
        - containerPort: 8000
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 2
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
```

#### Load Balancing Configuration Checklist

- [ ] Load balancing algorithm
  - Should be: round-robin or least-conn
  - Check for weighted distribution
  
- [ ] Health checks
  - Endpoint: /health or /ping
  - Interval: 3-5 seconds
  - Threshold: 2-3 failures before removal
  
- [ ] Connection settings
  - Keep-alive enabled
  - Appropriate timeouts (5s for ad requests)
  - Connection limits
  
- [ ] Session management
  - Session affinity (if required)
  - Sticky sessions configuration
  
- [ ] High availability
  - Multiple load balancers
  - Failover configuration
  - Health check redundancy

#### Load Balancer Performance Targets
```
Metric: Request distribution
- Goal: Even distribution across instances
- Measurement: Instance request counts should be within 5% of each other

Metric: Failover time
- Goal: < 10 seconds to remove failed instance
- Measurement: Time from health check failure to instance removal

Metric: Load balancer latency
- Goal: < 5ms added to request
- Measurement: Request timing comparison with/without LB

Metric: Connection reuse
- Goal: > 95% connection reuse
- Measurement: TCP connection metrics
```

---

### 6. HORIZONTAL SCALING ANALYSIS

#### File Patterns to Search
```
Files to find:
- docker-compose.yaml
- **/*deploy*.yaml or **/*kubernetes*.yaml
- **/*terraform* or **/infrastructure/**
- **/*config*.py (hardcoded vs. environment variables)
- **/database.py or **/redis.py (connection strings)
```

#### Code Patterns to Search For

**GOOD: Stateless Design**
```python
# GOOD PATTERN - No local state:
class AdServer:
    def __init__(self):
        self.redis = Redis(host=os.getenv('REDIS_HOST'))
        self.db = create_engine(os.getenv('DATABASE_URL'))
    
    async def get_ad(self, ad_id):
        # All state comes from external systems
        ad = await self.db.query(Ad).get(ad_id)
        return ad

# Can be deployed as 1, 10, or 1000 instances!
```

**ANTI-PATTERN: Local State**
```python
# BAD PATTERN - Local memory caching:
class AdServer:
    def __init__(self):
        self.local_cache = {}  # Problem: not shared!
    
    def get_ad(self, ad_id):
        if ad_id not in self.local_cache:
            self.local_cache[ad_id] = db.query(Ad).get(ad_id)
        return self.local_cache[ad_id]

# If you run 3 instances, each has its own cache
# Cache hits only work per instance
# Not suitable for horizontal scaling
```

**DISTRIBUTED RATE LIMITING**

```python
# GOOD PATTERN - Using Redis:
from redis import Redis

redis = Redis()

async def check_rate_limit(customer_id, limit=100, window=60):
    key = f"ratelimit:{customer_id}"
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, window)
    return current <= limit

# Works across all instances!
```

#### Horizontal Scaling Checklist

- [ ] Stateless application
  - No local caches
  - No session affinity required
  - Configuration from environment
  
- [ ] Distributed state management
  - Redis for distributed caching
  - Database for persistence
  - No instance-specific data
  
- [ ] Configuration management
  - All config from environment variables
  - No hardcoded values
  - Support for configuration hot-reload
  
- [ ] Database scalability
  - Read replicas for read-heavy workloads
  - Connection pooling configured
  - Prepared statements for efficiency
  
- [ ] Deployment readiness
  - Docker images ready
  - Orchestration manifests (K8s, Docker Compose)
  - Service discovery working
  
- [ ] Data consistency
  - Distributed locking for critical operations
  - Event ordering for state changes
  - Idempotent operations

#### Scaling Performance Targets
```
Metric: Linear scaling
- Goal: 2 instances = 2x throughput
- Measurement: Load test with 1, 2, 4, 8 instances

Metric: Scaling lag
- Goal: New instance ready for traffic within 30 seconds
- Measurement: Time from deployment to serving requests

Metric: State consistency
- Goal: All instances see same data within 100ms
- Measurement: Cache invalidation propagation time

Metric: Database scaling
- Goal: Database remains < 80% CPU at max load
- Measurement: Database CPU metrics
```

---

### 7. MEMORY MANAGEMENT ANALYSIS

#### File Patterns to Search
```
Files to find:
- **/*.py (memory allocations)
- requirements.txt or pyproject.toml (memory profilers)
- docker-compose.yaml (memory limits)
- **/*kubernetes*.yaml (memory requests/limits)
```

#### Code Patterns to Search For

**MEMORY LEAK: Unbounded Cache Growth**
```python
# ANTI-PATTERN - Search for this:
cache = {}  # No limit!

def cache_ad(ad_id, ad):
    cache[ad_id] = ad  # Keeps growing forever!

# GOOD PATTERN:
from functools import lru_cache

@lru_cache(maxsize=10000)  # LRU with max size
def get_ad(ad_id):
    return db.query(Ad).get(ad_id)
```

**MEMORY LEAK: Circular References**
```python
# ANTI-PATTERN:
class Request:
    def __init__(self):
        self.response = None
        self.context = {}

request = Request()
request.response = Response()
request.response.request = request  # Circular reference!
# Garbage collection might not catch this immediately

# GOOD PATTERN:
# Use weak references or ensure cleanup
from weakref import ref

request.response.request = ref(request)  # Weak reference
```

**MEMORY LEAK: Generator Not Consumed**
```python
# ANTI-PATTERN:
def process_ads():
    for ad in get_all_ads():  # Generator
        yield process(ad)

# If not iterated fully, holds resources!

# GOOD PATTERN:
def process_ads_batch(batch_size=1000):
    for batch in batched(get_all_ads(), batch_size):
        processed = [process(ad) for ad in batch]
        yield from processed
        # Memory released after each batch
```

#### Memory Management Checklist

- [ ] Memory profiling
  - Use `memory_profiler` or `tracemalloc`
  - Identify large allocations
  - Look for unbounded data structures
  
- [ ] Cache size limits
  - LRU cache with maxsize
  - Redis eviction policy (allkeys-lru)
  - Connection pool limits
  
- [ ] Object lifecycle
  - Proper cleanup in __del__ methods
  - Context managers for resource cleanup
  - Garbage collection settings
  
- [ ] Collection sizes
  - Avoid loading entire tables in memory
  - Use pagination and batching
  - Stream processing for large datasets
  
- [ ] Third-party libraries
  - Check for known memory issues
  - Update to latest versions
  - Monitor dependency memory usage

#### Memory Performance Targets
```
Metric: Memory per request
- Goal: < 1MB per concurrent request
- Measurement: Memory / concurrent_requests

Metric: Memory growth rate
- Goal: Flat line after warm-up
- Measurement: Memory over time graph

Metric: GC pause time
- Goal: < 10ms pause time
- Measurement: Application metrics

Metric: Cache memory usage
- Goal: < 30% of total application memory
- Measurement: cache_size / total_memory

Metric: Leak detection
- Goal: 0 memory leaks detected
- Measurement: Memory profiler analysis
```

---

### 8. REQUEST/RESPONSE OPTIMIZATION

#### File Patterns to Search
```
Files to find:
- **/*middleware*.py (request/response handling)
- **/*serializer*.py or **/*encoder*.py
- **/*routes*.py or **/*endpoints*.py
- nginx.conf (compression settings)
- **/*dto*.py or **/*schema*.py (response models)
```

#### Code Patterns to Search For

**RESPONSE COMPRESSION**

```python
# GOOD PATTERN - FastAPI with compression:
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware

app = FastAPI()
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Automatically gzips responses > 1KB

# MANUAL APPROACH:
@app.get("/ads")
async def get_ads():
    data = {"ads": [...]}
    return Response(
        content=json.dumps(data),
        media_type="application/json",
        headers={"content-encoding": "gzip"}
    )
```

**RESPONSE SERIALIZATION**

```python
# GOOD PATTERN - Minimal JSON:
@app.get("/ads/{ad_id}")
async def get_ad(ad_id: int):
    ad = await db.get_ad(ad_id)
    return {
        "id": ad.id,
        "creative": ad.creative_url,
        "link": ad.click_url,
        "price": ad.price,
    }  # Only necessary fields!

# BAD PATTERN - Full object serialization:
@app.get("/ads/{ad_id}")
async def get_ad(ad_id: int):
    ad = await db.get_ad(ad_id)
    return ad  # Includes all columns, timestamps, metadata!
```

**REQUEST VALIDATION**

```python
# GOOD PATTERN - FastAPI validation:
from pydantic import BaseModel

class AdRequest(BaseModel):
    ad_slot_id: int
    user_id: str
    geo_lat: float
    geo_lon: float
    
@app.get("/ads")
async def get_ads(request: AdRequest):
    # Validation happens automatically
    # Invalid requests rejected early
    return select_ads(request)
```

**CACHING HEADERS**

```python
# GOOD PATTERN:
@app.get("/ads/{ad_id}")
async def get_ad(ad_id: int):
    ad = await db.get_ad(ad_id)
    return Response(
        content=json.dumps(ad_dict),
        media_type="application/json",
        headers={
            "Cache-Control": "public, max-age=3600",
            "ETag": f'"{ad.version}"',
        }
    )
```

#### Request/Response Optimization Checklist

- [ ] Request parsing
  - Validation happens at entry point
  - Early rejection of invalid requests
  - Minimal object creation
  
- [ ] Response serialization
  - Only necessary fields included
  - Efficient serialization (JSON, msgpack)
  - No circular references
  
- [ ] Compression
  - Enable gzip/brotli
  - Minimum size threshold (1-5KB)
  - Nginx or middleware level
  
- [ ] Caching headers
  - Cache-Control headers set
  - ETag for conditional requests
  - Vary header for content variations
  
- [ ] HTTP optimizations
  - HTTP/2 or HTTP/1.1 keep-alive
  - Connection reuse
  - Pipelining enabled
  
- [ ] Response size
  - Paginated responses where applicable
  - Field filtering
  - Incremental loading

#### Request/Response Performance Targets
```
Metric: Response size
- Goal: < 50KB for typical ad response
- Measurement: Average response size

Metric: Serialization time
- Goal: < 10ms for response building
- Measurement: Response building duration

Metric: Compression ratio
- Goal: 70-80% compression ratio
- Measurement: Compressed / uncompressed size

Metric: TTFB (Time To First Byte)
- Goal: < 50ms
- Measurement: Time to first byte in network tab

Metric: Request validation latency
- Goal: < 5ms for validation
- Measurement: Validation timing
```

---

### 9. REAL-TIME BIDDING (RTB) PERFORMANCE

#### File Patterns to Search
```
Files to find:
- **/*bidding*.py or **/*rtb*.py or **/*auction*.py
- **/*exchange*.py (SSP/exchange integration)
- **/*timeout*.py or **/*circuit*.py (error handling)
- docker-compose.yaml (external service mocks)
```

#### Code Patterns to Search For

**GOOD: Parallel RTB Requests**
```python
# GOOD PATTERN - Parallel requests with timeout:
async def get_bids(ad, timeout_ms=100):
    try:
        results = await asyncio.wait_for(
            asyncio.gather(
                fetch_bid_from_exchange(exchange1, ad),
                fetch_bid_from_exchange(exchange2, ad),
                fetch_bid_from_exchange(exchange3, ad),
                return_exceptions=True
            ),
            timeout=timeout_ms / 1000.0
        )
        
        # Filter out exceptions/timeouts
        valid_bids = [b for b in results if isinstance(b, Bid)]
        
        if not valid_bids:
            return get_fallback_ad()
        
        return select_best_bid(valid_bids)
    except asyncio.TimeoutError:
        # All exchanges timed out
        return get_fallback_ad()
```

**ANTI-PATTERN: Sequential Requests**
```python
# BAD PATTERN - Search for this:
def get_bids(ad):
    bid1 = requests.get(exchange1_url)  # Waits 100ms
    bid2 = requests.get(exchange2_url)  # Waits 100ms
    bid3 = requests.get(exchange3_url)  # Waits 100ms
    # Total: 300ms! Should be 100ms in parallel!
    return select_best_bid([bid1, bid2, bid3])
```

**CIRCUIT BREAKER PATTERN**

```python
# GOOD PATTERN:
from pybreaker import CircuitBreaker

exchange_breaker = CircuitBreaker(
    fail_max=5,           # Fail 5 times
    reset_timeout=60      # Before trying again
)

async def fetch_from_exchange(exchange_url):
    try:
        return await exchange_breaker.call(fetch_with_timeout, exchange_url)
    except CircuitBreaker.CircuitBreakerListener:
        # Circuit open, return fallback
        return get_fallback_bid()
```

**RTB TIMEOUT HANDLING**

```python
# GOOD PATTERN - Smart timeout:
async def rtb_request_with_timeout(exchange_url, timeout_ms=100):
    start = time.time()
    try:
        result = await asyncio.wait_for(
            fetch_from_exchange(exchange_url),
            timeout=timeout_ms / 1000.0
        )
        elapsed = (time.time() - start) * 1000
        return result
    except asyncio.TimeoutError:
        # Log timeout for monitoring
        log_rtb_timeout(exchange_url, timeout_ms)
        return None
```

#### RTB Performance Analysis Checklist

- [ ] Request parallelization
  - All exchange requests should be async.gather()
  - No sequential requests to different exchanges
  - Timeouts should allow all parallel
  
- [ ] Timeout configuration
  - Per-exchange timeout (100ms is typical)
  - Overall auction timeout (100-150ms)
  - Proper handling of timeout exceptions
  
- [ ] Circuit breakers
  - For each exchange connection
  - Fail-open or fail-closed strategy
  - Timeout before retry
  
- [ ] Fallback strategy
  - Fallback ad when RTB fails
  - Quality metrics for fallback
  - Fallback should not exceed 100ms additional
  
- [ ] Connection pooling
  - HTTP client pool for exchange connections
  - Connection reuse
  - Keep-alive enabled
  
- [ ] Bid response parsing
  - Efficient JSON parsing
  - Early validation
  - Streaming response handling if needed
  
- [ ] Monitoring
  - Exchange success rate
  - Response time by exchange
  - Timeout frequency
  - Bid quality metrics

#### RTB Performance Targets
```
Metric: RTB round-trip time
- Goal: < 100ms
- Critical: < 150ms
- Measurement: Time to receive first bid response

Metric: Exchange success rate
- Goal: > 95% success
- Measurement: Successful bids / total requests

Metric: Parallel efficiency
- Goal: 3 exchanges complete in ~100ms (not 300ms)
- Measurement: Max time vs. sum of individual times

Metric: Timeout frequency
- Goal: < 1% of requests
- Measurement: Timeout events / total requests

Metric: Fallback ad quality
- Goal: At least 90% CTR of winning bids
- Measurement: Fallback vs. regular ad CTR

Metric: Circuit breaker trips
- Goal: 0 per hour in normal operation
- Measurement: Circuit breaker events
```

---

### 10. CDN/EDGE COMPUTING SETUP

#### File Patterns to Search
```
Files to find:
- **/*cdn*.py or **/*edge*.py
- cloudflare.yaml or **/cloudflare/**
- **/*akamai* or **/akamai/**
- nginx.conf (origin configuration)
- **/*static* (creative directory)
```

#### Code Patterns to Search For

**CDN CONFIGURATION FOR CREATIVES**

```python
# GOOD PATTERN:
@app.get("/creative/{creative_id}")
async def get_creative(creative_id: str):
    creative = await db.get_creative(creative_id)
    return Response(
        content=creative.image_data,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=86400",  # 24 hours
            "CDN-Cache-Control": "max-age=2592000",   # 30 days in CDN
            "ETag": f'"{creative.version}"',
        }
    )
```

**EDGE FUNCTION FOR AD SELECTION (Cloudflare)**

```javascript
// GOOD PATTERN - Edge function for fast ad serving:
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Ad selection at edge, close to user
  const userGeo = request.headers.get('cf-ipcountry')
  const userAgent = request.headers.get('user-agent')
  
  const response = await fetch('https://origin.adserver.com/ads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      geo: userGeo,
      user_agent: userAgent,
    })
  })
  
  // Cache at edge
  const cacheHeaders = new Headers(response.headers)
  cacheHeaders.set('Cache-Control', 'public, max-age=3600')
  
  return new Response(response.body, {
    status: response.status,
    headers: cacheHeaders,
  })
}
```

**GEOGRAPHIC ROUTING**

```yaml
# GOOD PATTERN - Regional servers:
apiVersion: v1
kind: Service
metadata:
  name: adserver
  annotations:
    cloud.google.com/neg: '{"ingress": true}'
spec:
  type: LoadBalancer
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 3600
  selector:
    app: adserver
  ports:
  - port: 80
    targetPort: 8000
---
# Separate regional deployments
apiVersion: apps/v1
kind: Deployment
metadata:
  name: adserver-us-east
  labels:
    region: us-east
spec:
  replicas: 10
  selector:
    matchLabels:
      app: adserver
      region: us-east
  template:
    metadata:
      labels:
        app: adserver
        region: us-east
    spec:
      nodeSelector:
        region: us-east
      containers:
      - name: adserver
        image: adserver:latest
```

#### CDN/Edge Computing Checklist

- [ ] Creative delivery
  - Creatives served from CDN
  - Cache control headers set
  - Geographic distribution
  
- [ ] Cache invalidation
  - TTL-based expiration
  - Event-based invalidation
  - Versioning strategy
  
- [ ] Edge functions
  - Ad selection at edge (if applicable)
  - User geo-targeting at edge
  - Request filtering at edge
  
- [ ] Regional servers
  - Multiple regions for latency
  - Affinity routing based on geography
  - Regional database replicas
  
- [ ] Static asset optimization
  - Image compression
  - Format selection (webp, etc.)
  - Lazy loading

#### CDN/Edge Performance Targets
```
Metric: Creative delivery time
- Goal: < 100ms to user
- Measurement: Creative load time from user location

Metric: Cache hit rate at CDN
- Goal: > 90%
- Measurement: Cache hits / total requests

Metric: Edge function latency
- Goal: < 50ms
- Measurement: Edge execution time

Metric: Regional server latency
- Goal: < 50ms p95 within region
- Measurement: Latency by region

Metric: Geographic routing accuracy
- Goal: > 99% correct region
- Measurement: User location vs. served region
```

---

## SPECIFIC CODE SEARCH PATTERNS

### Python-Specific Searches

```bash
# Find all database queries
grep -r "\.query\|\.get\|\.all\|\.filter\|SELECT" src/

# Find async endpoints
grep -r "async def" src/

# Find cache usage
grep -r "cache\|redis\|@cache" src/

# Find external API calls
grep -r "requests\|aiohttp\|http" src/

# Find potentially blocking I/O
grep -r "open\|read\|write" src/

# Find unhandled exceptions
grep -r "except:" src/

# Find hardcoded values
grep -r "localhost\|127.0.0.1\|password" src/

# Find size-unlimited collections
grep -r "\[\]\|{}" src/
```

### Metrics to Calculate

```
Performance Score = (Database Optimization + Caching Quality + Concurrency 
                    + Connection Pooling + Load Balancing + Scalability) / 6

Rating Scale:
- 90-100: Production-ready high-performance
- 75-89: Production-ready, needs optimization
- 60-74: Limited production use, significant bottlenecks
- < 60: Not suitable for production
```

---

## FILE LOCATIONS FOR RECOMMENDATIONS

### Once Code is Committed, Check:

```
Database Performance:
  Location: /src/models/*
  Location: /src/services/db_service.py
  Location: /migrations/*
  
Caching:
  Location: /src/services/cache_service.py
  Location: /src/utils/*decorators*.py
  Location: /config/*

Concurrency:
  Location: /src/server/app.py
  Location: /src/routes/*.py
  Location: /src/workers/*

Load Balancing:
  Location: /nginx.conf
  Location: /docker-compose.yaml
  Location: /k8s/* or /kubernetes/*

Scaling:
  Location: /config/*yaml
  Location: /Dockerfile
  Location: /src/server/config.py

Memory:
  Location: /src/**/*.py (all files)
  Location: /requirements.txt
  
RTB:
  Location: /src/services/bidding_engine.py
  Location: /src/services/auction.py

CDN:
  Location: /nginx.conf or /cdn/*
  Location: /src/routes/static.py or /src/routes/creative.py
```

---

## NEXT ACTIONS

1. **Get the code committed** to the repository
2. **Use this framework** to analyze each component
3. **Run specific grep patterns** to find code issues
4. **Create detailed recommendations** based on findings
5. **Prioritize improvements** based on impact

