import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState(null);
  const [cartLoading, setCartLoading] = useState(false);
  // Price/availability changes detected by the server since items were added
  const [cartChanges, setCartChanges] = useState([]);

  const fetchCart = useCallback(async () => {
    if (!user) { setCart(null); return; }
    setCartLoading(true);
    try {
      const { data } = await api.get('/cart');
      setCart(data.data);
      setCartChanges(data.changes || []);
    } catch {
      setCart(null);
    } finally {
      setCartLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  const addToCart = async (productId, quantity = 1) => {
    const { data } = await api.post('/cart', { productId, quantity });
    setCart(data.data);
    setCartChanges(data.changes || []);
    return data.data;
  };

  const updateCartItem = async (productId, quantity) => {
    const { data } = await api.put(`/cart/${productId}`, { quantity });
    setCart(data.data);
    setCartChanges(data.changes || []);
  };

  const removeFromCart = async (productId) => {
    const { data } = await api.delete(`/cart/${productId}`);
    setCart(data.data);
  };

  const clearCart = async () => {
    await api.delete('/cart');
    setCart(null);
  };

  const cartCount = cart?.items?.reduce((sum, i) => sum + i.quantity, 0) || 0;
  // Display-only estimate; checkout always uses the server quote.
  const cartTotal = cart?.items?.reduce((sum, i) => sum + (i.price * i.quantity), 0) || 0;

  return (
    <CartContext.Provider value={{ cart, cartLoading, cartCount, cartTotal, cartChanges, addToCart, updateCartItem, removeFromCart, clearCart, fetchCart }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
