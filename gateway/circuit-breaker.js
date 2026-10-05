class CircuitOpenError extends Error {
  constructor(service) {
    super(`Downstream circuit is open for ${service}`);
    this.name = 'CircuitOpenError';
    this.code = 'ECIRCUITOPEN';
    this.service = service;
    this.response = {
      status: 503,
      data: { error: `Serviço temporariamente indisponível: ${service}` },
    };
  }
}

class CircuitBreaker {
  constructor({ failureThreshold = 3, resetTimeout = 10000 } = {}) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.state = 'CLOSED';
    this.failures = 0;
    this.openedAt = 0;
  }

  canRequest() {
    if (this.state === 'CLOSED') return true;
    if (Date.now() - this.openedAt >= this.resetTimeout) {
      this.state = 'HALF_OPEN';
      return true;
    }
    return false;
  }

  success() {
    this.state = 'CLOSED';
    this.failures = 0;
  }

  failure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
    }
  }

  async execute(service, operation) {
    if (!this.canRequest()) throw new CircuitOpenError(service);

    try {
      const result = await operation();
      this.success();
      return result;
    } catch (error) {
      // Client errors are valid downstream responses and should not take a
      // healthy service out of rotation.
      if (!error.response || error.response.status >= 500) this.failure();
      throw error;
    }
  }
}

module.exports = { CircuitBreaker, CircuitOpenError };
