// src/components/Home.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const Home = ({ user }) => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDriver, setNewDriver] = useState({ id: '', name: '', total_collected: '' });

  useEffect(() => {
    const fetchDrivers = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('drivers').select('*');

      if (error) {
        console.error('Error fetching drivers:', error);
      } else {
        const updatedDrivers = data.map((driver) => {
          let incentive = 0;
          if (driver.total_collected >= 200000) {
            incentive = 1000;
          } else if (driver.total_collected >= 100000) {
            incentive = 500;
          }
          return { ...driver, incentive };
        });
        setDrivers(updatedDrivers);
      }
      setLoading(false);
    };

    fetchDrivers();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewDriver((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddDriver = async () => {
    const { data, error } = await supabase.from('drivers').insert([newDriver]);

    if (error) {
      console.error('Error adding driver:', error);
    } else {
      setDrivers((prev) => [...prev, ...data]);
      setNewDriver({ id: '', name: '', total_collected: '' });
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold underline mb-4">Drivers Incentive Program</h1>
      <p>Welcome, {user.email}</p>

      <div className="flex">
        <div className="w-1/4 p-4">
          <h2 className="text-xl font-bold mb-2">Add Driver</h2>
          <input
            type="text"
            name="id"
            placeholder="Driver ID"
            value={newDriver.id}
            onChange={handleInputChange}
            className="mb-2 p-2 border rounded w-full"
          />
          <input
            type="text"
            name="name"
            placeholder="Driver Name"
            value={newDriver.name}
            onChange={handleInputChange}
            className="mb-2 p-2 border rounded w-full"
          />
          <input
            type="number"
            name="total_collected"
            placeholder="Total Collected"
            value={newDriver.total_collected}
            onChange={handleInputChange}
            className="mb-2 p-2 border rounded w-full"
          />
          <button
            onClick={handleAddDriver}
            className="bg-blue-500 text-white py-2 px-4 rounded w-full"
          >
            Submit
          </button>
        </div>

        <div className="w-3/4 p-4">
          <h2 className="text-xl font-bold mb-2">Drivers List</h2>
          <input
            type="text"
            placeholder="Search"
            className="mb-2 p-2 border rounded w-full"
          />
          <button
            className="bg-green-500 text-white py-2 px-4 rounded mb-2"
          >
            Add Driver
          </button>
          {loading ? (
            <p>Loading drivers...</p>
          ) : (
            <table className="table-auto w-full border-collapse">
              <thead>
                <tr>
                  <th className="border px-4 py-2">ID</th>
                  <th className="border px-4 py-2">Name</th>
                  <th className="border px-4 py-2">Amount Delivered</th>
                  <th className="border px-4 py-2">Date</th>
                  <th className="border px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.id}>
                    <td className="border px-4 py-2">{driver.id}</td>
                    <td className="border px-4 py-2">{driver.name}</td>
                    <td className="border px-4 py-2">{driver.total_collected}</td>
                    <td className="border px-4 py-2">{new Date(driver.created_at).toLocaleDateString()}</td>
                    <td className="border px-4 py-2">
                      <button className="bg-yellow-500 text-white py-1 px-2 rounded mr-2">Claim</button>
                      <button className="bg-red-500 text-white py-1 px-2 rounded">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
