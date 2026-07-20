import { Routes, Route } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import Home from "./pages/Home";
import BuildPlan from "./pages/BuildPlan";
import ModelResults from "./pages/ModelResults";
import Recommendation from "./pages/Recommendation";
import Analytics from "./pages/Analytics";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="build" element={<BuildPlan />} />
        <Route path="model" element={<ModelResults />} />
        <Route path="recommendation" element={<Recommendation />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
