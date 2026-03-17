import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || '';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

export const fetchMembers = async () => {
  const res = await api.get('/api/members');
  return res.data.members;
};

export const fetchAllRecords = async () => {
  const res = await api.get('/api/records');
  return res.data.records;
};

export const fetchRecordsByName = async (name) => {
  const res = await api.get(`/api/records/${encodeURIComponent(name)}`);
  return res.data.records;
};

export const createPunchRecord = async (payload) => {
  const res = await api.post('/api/punch', payload);
  return res.data;
};

export const deleteRecord = async (id) => {
  const res = await api.delete(`/api/records/${id}`);
  return res.data;
};

export const healthCheck = async () => {
  const res = await api.get('/api/health');
  return res.data;
};

export default api;
