import axios from 'axios';

export const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || 'http://localhost:5001';

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export default client;
