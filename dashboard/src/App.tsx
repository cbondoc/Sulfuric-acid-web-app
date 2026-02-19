import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LiveStatus } from './pages/LiveStatus';
import { ProductionSummary } from './pages/ProductionSummary';
import { ProcessInfo } from './pages/ProcessInfo';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<LiveStatus />} />
          <Route path="production" element={<ProductionSummary />} />
          <Route path="process" element={<ProcessInfo />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
