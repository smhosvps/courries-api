// backend/utils/deliveryUtils.ts
export const generateDeliveryCode = (): string => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `DEL-${timestamp}${random}`;
  };
  
  export const calculateDeliveryPrice = (
    basePrice: number,
    pricePerKm: number,
    distance: number,
    taxRate: number = 0.075,
    serviceFeeRate: number = 0.05
  ) => {
    const distanceFee = pricePerKm * distance;
    const subtotal = basePrice + distanceFee;
    const tax = subtotal * taxRate;
    const serviceFee = subtotal * serviceFeeRate;
    const total = subtotal + tax + serviceFee;
    
    return {
      basePrice,
      pricePerKm,
      distance,
      distanceFee,
      subtotal,
      tax,
      serviceFee,
      total
    };
  };
  
  // Delivery type configurations (matching frontend)
  export const DELIVERY_TYPES = {
    bicycle: { basePrice: 800, pricePerKm: 100 },
    bike: { basePrice: 1800, pricePerKm: 200 },
    car: { basePrice: 3500, pricePerKm: 300 },
    van: { basePrice: 5000, pricePerKm: 400 },
  };