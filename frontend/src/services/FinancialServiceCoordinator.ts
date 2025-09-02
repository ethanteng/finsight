/**
 * Financial Service Coordinator
 * 
 * This service helps coordinate between different financial service components
 * (Plaid Link, SnapTrade, etc.) to prevent conflicts and ensure smooth user experience.
 */

class FinancialServiceCoordinator {
  private activeServices: Set<string> = new Set();
  private listeners: Map<string, (isActive: boolean) => void> = new Map();

  /**
   * Register a service as active
   */
  registerService(serviceName: string): void {
    console.log(`FinancialServiceCoordinator: Registering ${serviceName}`);
    this.activeServices.add(serviceName);
    this.notifyListeners();
  }

  /**
   * Unregister a service as active
   */
  unregisterService(serviceName: string): void {
    console.log(`FinancialServiceCoordinator: Unregistering ${serviceName}`);
    this.activeServices.delete(serviceName);
    this.notifyListeners();
  }

  /**
   * Check if any services are currently active
   */
  hasActiveServices(): boolean {
    return this.activeServices.size > 0;
  }

  /**
   * Check if a specific service is active
   */
  isServiceActive(serviceName: string): boolean {
    return this.activeServices.has(serviceName);
  }

  /**
   * Get list of active services
   */
  getActiveServices(): string[] {
    return Array.from(this.activeServices);
  }

  /**
   * Subscribe to service status changes
   */
  subscribe(listenerId: string, callback: (isActive: boolean) => void): void {
    this.listeners.set(listenerId, callback);
  }

  /**
   * Unsubscribe from service status changes
   */
  unsubscribe(listenerId: string): void {
    this.listeners.delete(listenerId);
  }

  /**
   * Notify all listeners about service status changes
   */
  private notifyListeners(): void {
    const isActive = this.hasActiveServices();
    this.listeners.forEach((callback) => {
      try {
        callback(isActive);
      } catch (error) {
        console.error('Error in FinancialServiceCoordinator listener:', error);
      }
    });
  }

  /**
   * Clear all services (useful for cleanup)
   */
  clear(): void {
    console.log('FinancialServiceCoordinator: Clearing all services');
    this.activeServices.clear();
    this.notifyListeners();
  }
}

// Export a singleton instance
export const financialServiceCoordinator = new FinancialServiceCoordinator();

// Service names
export const SERVICE_NAMES = {
  PLAID_LINK: 'plaid-link',
  SNAPTRADE: 'snaptrade',
} as const;
