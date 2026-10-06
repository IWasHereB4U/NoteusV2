import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { YardProvider } from './context/YardContext.jsx';
import { AccentSync } from './context/ShadeContext.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Layout } from './components/Layout.jsx';
import { Login } from './pages/Login.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Clients } from './pages/Clients.jsx';
import { Money } from './pages/Money.jsx';
import { Invoices } from './pages/Invoices.jsx';
import { Tasks } from './pages/Tasks.jsx';
import { Meetings } from './pages/Meetings.jsx';
import { Timesheet } from './pages/Timesheet.jsx';
import { Calendar } from './pages/Calendar.jsx';
import { FilingDesk } from './pages/FilingDesk.jsx';
import { Settings } from './pages/Settings.jsx';
import { Circle } from './pages/Circle.jsx';
import { Notes } from './pages/Notes.jsx';
import { NoteTags } from './pages/NoteTags.jsx';
import { Maps } from './pages/Maps.jsx';
import { Converter } from './pages/Converter.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AccentSync />
        <YardProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/money" element={<Money />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/timesheet" element={<Timesheet />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/filing" element={<FilingDesk />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/circle" element={<Circle />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/note-tags" element={<NoteTags />} />
            <Route path="/maps" element={<Maps />} />
            <Route path="/converter" element={<Converter />} />
          </Route>
        </Routes>
        </YardProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
