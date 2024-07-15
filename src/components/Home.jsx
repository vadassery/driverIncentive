import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  FaPlus,
  FaSearch,
  FaSignOutAlt,
  FaTrashAlt,
  FaClipboardCheck,
  FaTimes,
  FaCheck,
  FaBan,
  FaEye,
  FaDownload,
} from "react-icons/fa";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import jsPDF from "jspdf";
import "jspdf-autotable";

const Home = ({ user }) => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDelivery, setNewDelivery] = useState({
    id: "",
    name: "",
    total_collected: "",
    bill_number: "",
  });
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [filterPoints, setFilterPoints] = useState("All");
  const [showConfirmClaimModal, setShowConfirmClaimModal] = useState(false);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);
  const [newDriver, setNewDriver] = useState({ name: "", role: "Driver" });
  const [showDriverDetailsModal, setShowDriverDetailsModal] = useState(false);
  const [driverDetails, setDriverDetails] = useState([]);
  const [filterMonth, setFilterMonth] = useState(new Date());

  const notifySuccess = (message) => toast.success(message);
  const notifyError = (message) => toast.error(message);
  const notifyInfo = (message) => toast.info(message);
  const notifyWarning = (message) => toast.warning(message);

  useEffect(() => {
    fetchDrivers();

    const driversSubscription = supabase
      .channel("public:drivers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        (payload) => {
          handleRealTimeDrivers(payload);
        }
      )
      .subscribe();

    const deliveriesSubscription = supabase
      .channel("public:deliveries")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        (payload) => {
          handleRealTimeDeliveries(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(driversSubscription);
      supabase.removeChannel(deliveriesSubscription);
    };
  }, []);

  const handleRealTimeDrivers = (payload) => {
    if (payload.eventType === "INSERT") {
      setDrivers((prevDrivers) => [...prevDrivers, payload.new]);
    } else if (payload.eventType === "UPDATE") {
      setDrivers((prevDrivers) =>
        prevDrivers.map((driver) =>
          driver.driver_id === payload.new.driver_id ? payload.new : driver
        )
      );
    } else if (payload.eventType === "DELETE") {
      setDrivers((prevDrivers) =>
        prevDrivers.filter((driver) => driver.driver_id !== payload.old.driver_id)
      );
    }
  };

  const handleRealTimeDeliveries = (payload) => {
    if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
      fetchDriverDetails(payload.new.driver_id);
    }
  };

  const fetchDrivers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("drivers")
      .select("*")
      .eq("client_id", user.client_id)
      .order("driver_id", { ascending: true });

    if (error) {
      console.error("Error fetching drivers:", error);
      notifyError("Error fetching drivers");
    } else {
      setDrivers(data);
    }
    setLoading(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewDelivery((prev) => ({ ...prev, [name]: value }));

    if (name === "id" && value) {
      fetchDriverName(value);
    }
  };

  const fetchDriverName = async (driverId) => {
    const { data, error } = await supabase
      .from("drivers")
      .select("name")
      .eq("driver_id", driverId)
      .eq("client_id", user.client_id)
      .single();

    if (error) {
      console.error("Error fetching driver name:", error);
      setNewDelivery((prev) => ({ ...prev, name: "" }));
    } else {
      setNewDelivery((prev) => ({ ...prev, name: data.name }));
    }
  };

  const handleAddDelivery = async () => {
    const { data: driver, error } = await supabase
      .from("drivers")
      .select("*")
      .eq("driver_id", newDelivery.id)
      .eq("client_id", user.client_id)
      .single();

    if (error || !driver) {
      console.error("Driver not found:", error);
      notifyError("Driver not found");
      return;
    }

    const updatedTotal =
      driver.total_collected + parseFloat(newDelivery.total_collected);
    let unclaimedPoints = driver.unclaimed_points || 0;
    let claimedPoints = driver.claimed_points || 0;
    let claimedDelivery = false;

    if (updatedTotal >= 100000) {
      unclaimedPoints += 1;
      claimedDelivery = true;
    }

    const { error: updateError } = await supabase
      .from("drivers")
      .update({
        total_collected: updatedTotal,
        unclaimed_points: unclaimedPoints,
        claimed_points: claimedPoints,
      })
      .eq("driver_id", newDelivery.id)
      .eq("client_id", user.client_id);

    if (updateError) {
      console.error("Error updating delivery:", updateError);
      notifyError("Error updating delivery");
    } else {
      const { error: insertError } = await supabase.from("deliveries").insert({
        driver_id: newDelivery.id,
        client_id: user.client_id,
        date: new Date().toISOString(),
        amount: parseFloat(newDelivery.total_collected),
        bill_number: newDelivery.bill_number,
        claimed: claimedDelivery,
      });

      if (insertError) {
        console.error("Error adding delivery record:", insertError);
        notifyError("Error adding delivery record");
      } else {
        notifySuccess("Delivery details added successfully!");
        if (updatedTotal >= 100000) {
          notifySuccess(`${driver.name} has reached the target and can claim points!`);
        }
      }
    }

    setNewDelivery({ id: "", name: "", total_collected: "", bill_number: "" });
  };

  const handleClaim = (driverId) => {
    const driver = drivers.find((d) => d.driver_id === driverId);
    if (!driver) return;

    setSelectedDriverId(driverId);
    setShowConfirmClaimModal(true);
  };

  const confirmClaim = async () => {
    const driver = drivers.find((d) => d.driver_id === selectedDriverId);
    if (!driver) return;

    const unclaimedPoints = Math.max(driver.unclaimed_points - 1, 0);
    const claimedPoints = (driver.claimed_points || 0) + 1;

    const { error } = await supabase
      .from("drivers")
      .update({
        unclaimed_points: unclaimedPoints,
        claimed_points: claimedPoints,
        total_collected: 0, // Reset total amount delivered
      })
      .eq("driver_id", selectedDriverId)
      .eq("client_id", user.client_id);

    if (error) {
      console.error("Error claiming points:", error);
      notifyError("Error claiming points");
    } else {
      notifySuccess("Points claimed successfully!");
    }

    setShowConfirmClaimModal(false);
  };

  const handleDeleteConfirm = (driverId) => {
    setSelectedDriverId(driverId);
    setShowConfirmDeleteModal(true);
  };

  const confirmDelete = async () => {
    const { error } = await supabase
      .from("drivers")
      .delete()
      .eq("driver_id", selectedDriverId)
      .eq("client_id", user.client_id);

    if (error) {
      console.error("Error deleting driver:", error);
      notifyError("Error deleting driver");
    } else {
      const { error: deleteDeliveriesError } = await supabase
        .from("deliveries")
        .delete()
        .eq("driver_id", selectedDriverId)
        .eq("client_id", user.client_id);

      if (deleteDeliveriesError) {
        console.error("Error deleting deliveries:", deleteDeliveriesError);
        notifyError("Error deleting deliveries");
      } else {
        setDrivers((prevDrivers) =>
          prevDrivers.filter((driver) => driver.driver_id !== selectedDriverId)
        );
        notifySuccess("Driver deleted successfully!");
        setSelectedDriverId(null);
      }
    }

    setShowConfirmDeleteModal(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    window.location.reload();
  };

  const addDriver = async () => {
    const { data: lastDriver, error: fetchError } = await supabase
      .from("drivers")
      .select("driver_id")
      .eq("client_id", user.client_id)
      .order("driver_id", { ascending: false })
      .limit(1)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching last driver ID:", fetchError);
      notifyError("Error fetching last driver ID");
      return;
    }

    const newDriverId = lastDriver ? lastDriver.driver_id + 1 : 100;

    const { error: insertError } = await supabase.from("drivers").insert({
      driver_id: newDriverId,
      name: newDriver.name,
      client_id: user.client_id,
      role: newDriver.role,
      unclaimed_points: 0,
      claimed_points: 0,
    });

    if (insertError) {
      console.error("Error adding driver:", insertError);
      notifyError("Error adding driver");
    } else {
      notifySuccess("Driver added successfully!");
      setNewDriver({ name: "", role: "Driver" });
      setShowAddDriverModal(false);
    }
  };

  const fetchDriverDetails = async (driverId) => {
    const { data, error } = await supabase
      .from("deliveries")
      .select("*")
      .eq("driver_id", driverId)
      .eq("client_id", user.client_id)
      .order("date", { ascending: false });

    if (error) {
      console.error("Error fetching driver details:", error);
      notifyError("Error fetching driver details");
    } else {
      setDriverDetails(data);
      setShowDriverDetailsModal(true);
    }
  };

  const filteredDriverDetails = driverDetails.filter((detail) =>
    new Date(detail.date).toISOString().startsWith(filterMonth.toISOString().slice(0, 7))
  );

  const filteredDrivers = drivers.filter((driver) => {
    const matchesSearch = driver.name.toLowerCase().includes(search.toLowerCase()) ||
                          driver.driver_id.toString().includes(search);
    const matchesRole = filterRole === "All" || driver.role === filterRole;
    const matchesPoints = filterPoints === "All" ||
                          (filterPoints === "Claimed" && driver.claimed_points > 0) ||
                          (filterPoints === "Unclaimed" && driver.unclaimed_points > 0);
    return matchesSearch && matchesRole && matchesPoints;
  });

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.autoTable({
      head: [['ID', 'Name', 'Total Amount Delivered', 'Unclaimed Points', 'Claimed Points', 'Role']],
      body: filteredDrivers.map(driver => [
        driver.driver_id,
        driver.name,
        driver.total_collected,
        driver.unclaimed_points,
        driver.claimed_points,
        driver.role,
      ]),
    });
    doc.save('drivers_list.pdf');
  };

  return (
    <div className="mx-auto p-4 bg-gray-100 min-h-screen">
      <ToastContainer autoClose={2000} />
      <header className="flex justify-between items-center mb-6">
        <div className="flex flex-col items-center">
          <h1 className="text-3xl text-center font-bold text-gray-800">
            Drivers Incentive Program
          </h1>
          <p className="text-center text-gray-600 mt-2">
            powered by <span className="font-medium">whitesoft</span>
          </p>
        </div>

        <div className="flex items-center">
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white py-2 px-4 rounded flex items-center"
          >
            <FaSignOutAlt className="mr-2" />
            Logout
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white col-span-1 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4 text-gray-800">
            Add Delivered Details
          </h2>
          <div className="mb-4">
            <label
              htmlFor="driverId"
              className="block text-gray-700 font-bold mb-2"
            >
              Driver ID
            </label>
            <input
              type="number"
              name="id"
              placeholder="Enter Driver ID"
              value={newDelivery.id}
              onChange={handleInputChange}
              className="appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          <div className="mb-4">
            <label
              htmlFor="driverName"
              className="block text-gray-700 font-bold mb-2"
            >
              Driver Name
            </label>
            <input
              type="text"
              name="name"
              placeholder="Driver Name"
              value={newDelivery.name}
              onChange={handleInputChange}
              className="appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              disabled
            />
          </div>
          <div className="mb-4">
            <label
              htmlFor="billNumber"
              className="block text-gray-700 font-bold mb-2"
            >
              Bill Number
            </label>
            <input
              type="text"
              name="bill_number"
              placeholder="Enter Bill Number"
              value={newDelivery.bill_number}
              onChange={handleInputChange}
              className="appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          <div className="mb-4">
            <label
              htmlFor="deliveredAmount"
              className="block text-gray-700 font-bold mb-2"
            >
              Amount Delivered
            </label>
            <input
              type="number"
              step="0.01"
              name="total_collected"
              placeholder="Enter Amount Delivered"
              value={newDelivery.total_collected}
              onChange={handleInputChange}
              className="appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
  
          <button
            onClick={handleAddDelivery}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300"
          >
            Submit
          </button>
        </div>

        <div className="bg-white col-span-3 rounded-lg shadow-md px-6 py-3">

        <div className="flex flex-col md:flex-row mb-4 justify-between items-center">
  <h2 className="text-xl font-bold mb-4 md:mb-0 text-gray-800">Drivers List</h2>
  <button
    onClick={generatePDF}
    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300 flex items-center"
  >
    <FaDownload className="mr-2" />
    Download PDF
  </button>
</div>

<div className="flex flex-col md:flex-row mb-4">
  <div className="relative w-full md:mr-2 mb-4 md:mb-0">
    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
      <FaSearch className="text-gray-500" />
    </div>
    <input
      type="text"
      placeholder="Search"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="appearance-none border rounded w-full py-2 pl-10 pr-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
    />
  </div>

  <div className="relative w-full md:mr-2 mb-4 md:mb-0">
    <select
      value={filterRole}
      onChange={(e) => setFilterRole(e.target.value)}
      className="appearance-none border rounded w-full py-2 pl-3 pr-10 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
    >
      <option value="All">All Roles</option>
      <option value="Driver">Driver</option>
      <option value="Fabricator">Fabricator</option>
      <option value="Contractor">Contractor</option>
    </select>
  </div>

  <div className="relative w-full md:mr-2 mb-4 md:mb-0">
    <select
      value={filterPoints}
      onChange={(e) => setFilterPoints(e.target.value)}
      className="appearance-none border rounded w-full py-2 pl-3 pr-10 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
    >
      <option value="All">All Points</option>
      <option value="Claimed">Claimed Points</option>
      <option value="Unclaimed">Unclaimed Points</option>
    </select>
  </div>

  <button
    onClick={() => setShowAddDriverModal(true)}
    className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300 flex items-center"
  >
    <FaPlus className="mr-2" />
    Add
  </button>
</div>


          {loading ? (
            <p className="text-gray-600">Loading drivers...</p>
          ) : (
            <div className="overflow-y-auto h-[400px] 2xl:h-[700px]">
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y-2 divide-gray-200 bg-white text-sm">
                  <thead className="bg-gray-200">
                    <tr>
                      <th className="whitespace-nowrap text-center px-4 py-2 font-medium text-gray-900">
                        ID
                      </th>
                      <th className="whitespace-nowrap text-center px-4 py-2 font-medium text-gray-900">
                        Name
                      </th>
                      <th className="whitespace-nowrap text-center px-4 py-2 font-medium text-gray-900">
                        Total Amount Delivered
                      </th>
                      <th className="whitespace-nowrap text-center px-4 py-2 font-medium text-gray-900">
                        Unclaimed Points
                      </th>
                      <th className="whitespace-nowrap text-center px-4 py-2 font-medium text-gray-900">
                        Claimed Points
                      </th>
                      <th className="whitespace-nowrap text-center px-4 py-2 font-medium text-gray-900">
                        Role
                      </th>
                      <th className="whitespace-nowrap text-center px-4 py-2 font-medium text-gray-900">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredDrivers.map((driver) => (
                      <tr
                        key={driver.driver_id}
                        className="hover:bg-gray-100 text-center transition-colors duration-300"
                      >
                        <td className="whitespace-nowrap text-center px-4 py-2 font-medium text-gray-900">
                          {driver.driver_id}
                        </td>
                        <td className="whitespace-nowrap text-center px-4 py-2 text-gray-700">
                          {driver.name}
                        </td>
                        <td className="whitespace-nowrap text-center px-4 py-2 text-gray-700">
                          {driver.total_collected}
                        </td>
                        <td className="whitespace-nowrap text-center px-4 py-2 text-gray-700">
                          {driver.unclaimed_points}
                        </td>
                        <td className="whitespace-nowrap text-center px-4 py-2 text-gray-700">
                          {driver.claimed_points}
                        </td>
                        <td className="whitespace-nowrap text-center px-4 py-2 text-gray-700">
                          {driver.role}
                        </td>
                        <td className="whitespace-nowrap text-center px-4 py-2">
                          <button
                            className={`bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300 ${
                              driver.unclaimed_points === 0
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                            onClick={() => handleClaim(driver.driver_id)}
                            disabled={driver.unclaimed_points === 0}
                          >
                            <FaClipboardCheck className="mr-2" />
                            Claim
                          </button>
                          <button
                            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300 ml-2"
                            onClick={() => handleDeleteConfirm(driver.driver_id)}
                          >
                            <FaTrashAlt className="mr-2" />
                            Delete
                          </button>
                          <button
                            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300 ml-2"
                            onClick={() => fetchDriverDetails(driver.driver_id)}
                          >
                            <FaEye className="mr-2" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {showConfirmClaimModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-600 bg-opacity-50">
          <div className="bg-white p-6 rounded shadow-md">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">
              Confirm Claim
            </h2>
            <p className="text-gray-700 mb-4">
              Are you sure you want to claim points for this driver?
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowConfirmClaimModal(false)}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300 mr-2"
              >
                Cancel
              </button>
              <button
                onClick={confirmClaim}
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmDeleteModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-600 bg-opacity-50">
          <div className="bg-white p-6 rounded shadow-md">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">
              Confirm Delete
            </h2>
            <p className="text-gray-700 mb-4">
              Are you sure you want to delete this driver?
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowConfirmDeleteModal(false)}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300 mr-2"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddDriverModal && (
        <div className="fixed  inset-0 flex items-center justify-center bg-gray-600 bg-opacity-50">
          <div className="bg-white p-6 rounded shadow-md  w-full max-w-lg">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Add Driver</h2>
            <input
              type="text"
              placeholder="Driver Name"
              value={newDriver.name}
              onChange={(e) => setNewDriver((prev) => ({ ...prev, name: e.target.value }))}
              className="appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-4"
            />
            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">Role</label>
              <select
                value={newDriver.role}
                onChange={(e) => setNewDriver((prev) => ({ ...prev, role: e.target.value }))}
                className="appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              >
                <option value="Driver">Driver</option>
                <option value="Fabricator">Fabricator</option>
                <option value="Contractor">Contractor</option>
              </select>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddDriverModal(false)}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300 mr-2"
              >
                Cancel
              </button>
              <button
                onClick={addDriver}
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showDriverDetailsModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-600 bg-opacity-50">
          <div className="bg-white p-6 rounded shadow-md w-full max-w-lg">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">
              Driver Details
            </h2>
            <DatePicker
              selected={filterMonth}
              onChange={(date) => setFilterMonth(date)}
              dateFormat="MM/yyyy"
              showMonthYearPicker
              className="mb-4 border rounded px-3 py-2 text-gray-700"
            />
            <div className="overflow-y-auto h-[400px] 2xl:h-[700px]">
              <table className="min-w-full divide-y-2 divide-gray-200 bg-white text-sm mb-4">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="whitespace-nowrap text-left px-4 py-2 font-medium text-gray-900">
                      Date
                    </th>
                    <th className="whitespace-nowrap text-left px-4 py-2 font-medium text-gray-900">
                      Bill Number
                    </th>
                    <th className="whitespace-nowrap text-left px-4 py-2 font-medium text-gray-900">
                      Amount Delivered
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredDriverDetails.map((detail, index) => {
                    const isClaimed = driverDetails
                      .slice(0, index + 1)
                      .reduce((acc, cur) => acc + cur.amount, 0) >= 100000 && !driverDetails.slice(0, index).some(d => d.claimed);
                    return (
                      <tr key={detail.id}>
                        <td className="whitespace-nowrap px-4 py-2 text-gray-700 flex items-center">
                          {new Date(detail.date).toLocaleDateString()}
                          {detail.claimed && (
                            <span className="ml-2 bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded dark:bg-green-200 dark:text-green-900">
                              Claimed
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                          {detail.bill_number}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                          {detail.amount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowDriverDetailsModal(false)}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors duration-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
