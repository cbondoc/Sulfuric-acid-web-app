import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LiveStatus } from './pages/LiveStatus';
import { ProductionSummary } from './pages/ProductionSummary';
import { ProcessInfo } from './pages/ProcessInfo';
import { ControlPanel } from './pages/ControlPanel';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<LiveStatus />} />
          <Route path="control" element={<ControlPanel />} />
          <Route path="production" element={<ProductionSummary />} />
          <Route path="process" element={<ProcessInfo />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
