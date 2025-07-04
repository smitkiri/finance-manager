import { useState, useEffect } from 'react';
import { LocalStorage } from '../utils/storage';

export const useCategories = () => {
  const [categories, setCategories] = useState<string[]>([]);

  // Load categories on component mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const loadedCategories = await LocalStorage.loadCategories();
        setCategories(loadedCategories);
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    };
    
    loadCategories();
  }, []);

  const addCategory = async (category: string) => {
    try {
      const updatedCategories = await LocalStorage.addCategory(category);
      setCategories(updatedCategories);
      return true;
    } catch (error) {
      console.error('Error adding category:', error);
      return false;
    }
  };

  const deleteCategory = async (category: string) => {
    try {
      const updatedCategories = await LocalStorage.deleteCategory(category);
      setCategories(updatedCategories);
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      return false;
    }
  };

  const updateCategoryName = async (oldCategory: string, newCategory: string) => {
    try {
      const updatedCategories = await LocalStorage.updateCategory(oldCategory, newCategory);
      setCategories(updatedCategories);
      return true;
    } catch (error) {
      console.error('Error updating category name:', error);
      return false;
    }
  };

  return {
    categories,
    addCategory,
    deleteCategory,
    updateCategoryName,
  };
}; 