/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import StudentPortal from './components/StudentPortal';
import AdminDashboard from './components/AdminDashboard';
import { Globe, Database, GraduationCap, LogIn, LogOut } from 'lucide-react';
import { UniversityData } from './types';
import { db, auth } from './lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { handleFirestoreError, OperationType } from './lib/firebaseUtils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'student' | 'admin'>('student');
  const [dbData, setDbData] = useState<UniversityData[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    // Setup real-time listener for universities collection
    const unsubsribeDB = onSnapshot(collection(db, 'universities'), (snapshot) => {
      const data: UniversityData[] = [];
      snapshot.forEach(doc => {
        data.push(doc.data() as UniversityData);
      });
      setDbData(data);
      setIsLoading(false);
    }, (error) => {
      setIsLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'universities');
    });

    return () => unsubsribeDB();
  }, []);

  const handleSetData = async (newDataOrUpdater: UniversityData[] | ((prev: UniversityData[]) => UniversityData[])) => {
    try {
      if (!user) {
        alert("请先登录系统管理数据");
        return;
      }
      
      const newData = typeof newDataOrUpdater === 'function' ? newDataOrUpdater(dbData) : newDataOrUpdater;
      
      // Compute differences to determine what to delete, add, or update
      // Since it's a batch update, we can use a Firestore batch write
      const batch = writeBatch(db);
      const existingIds = new Set<string>(dbData.map(d => d.id));
      const newIds = new Set<string>(newData.map(d => d.id));

      let opCount = 0;
      
      // Find deletions
      for (const id of Array.from(existingIds)) {
        if (!newIds.has(id)) {
          batch.delete(doc(db, 'universities', id));
          opCount++;
        }
      }

      // Find additions/updates
      for (const item of newData) {
        const itemRef = doc(db, 'universities', item.id);
        const dataToWrite = { ...item, updatedAt: new Date().toISOString() };
        if (!existingIds.has(item.id)) {
            dataToWrite.createdAt = dataToWrite.createdAt || new Date().toISOString();
        }
        batch.set(itemRef, dataToWrite, { merge: true });
        opCount++;
      }

      // Only perform batch if there are operations
      if (opCount > 0) {
        // Warning: Firestore batches have a limit of 500 operations.
        // For larger data, chunking might be needed, but we keep it simple for now or chunk here.
        if (opCount > 450) {
           // Provide basic chunking for very large list modifications
           const itemsArray = Array.from(newData);
           const deletedIdsArray: string[] = Array.from(existingIds).filter(id => !newIds.has(id));
           
           for (let i=0; i < deletedIdsArray.length; i+= 450) {
             const chunkBatch = writeBatch(db);
             const chunk = deletedIdsArray.slice(i, i + 450);
             chunk.forEach((id: string) => chunkBatch.delete(doc(db, 'universities', id)));
             await chunkBatch.commit();
           }
           for (let i=0; i < itemsArray.length; i+= 450) {
             const chunkBatch = writeBatch(db);
             const chunk = itemsArray.slice(i, i + 450);
             chunk.forEach(item => {
               const dataToWrite = { ...item, updatedAt: new Date().toISOString() };
               if (!existingIds.has(item.id)) {
                   dataToWrite.createdAt = dataToWrite.createdAt || new Date().toISOString();
               }
               chunkBatch.set(doc(db, 'universities', item.id), dataToWrite, { merge: true });
             });
             await chunkBatch.commit();
           }
        } else {
          await batch.commit();
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'universities');
      alert("更新数据失败：" + (e as Error).message);
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Login failed", e);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveTab('student');
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-chocolate font-serif text-xl animate-pulse flex items-center gap-2">
          <Globe className="w-6 h-6 animate-spin" /> 数据加载中...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-chocolate font-sans">
      <header className="bg-surface-container-lowest border-b border-surface-dim px-6 py-4 flex items-center justify-between z-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-vellum p-2 rounded-xl border border-surface-dim shadow-sm">
            <Globe className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold text-chocolate leading-none mb-1">Global Univ Explorer</h1>
            <span className="text-[10px] uppercase tracking-widest font-bold text-chocolate-light">Data-Driven Consulting</span>
          </div>
        </div>
        
        <div className="flex bg-surface-container-high rounded-full p-1 border border-surface-dim shadow-inner">
          <button 
            onClick={() => setActiveTab('student')}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition-all ${
              activeTab === 'student' ? 'bg-surface-container-lowest shadow-sm text-primary border border-surface-dim' : 'text-chocolate-light hover:text-chocolate border border-transparent'
            }`}
          >
            <GraduationCap size={16} /> 咨询评估系统
          </button>
          {user && (
            <button 
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition-all ${
                activeTab === 'admin' ? 'bg-surface-container-lowest shadow-sm text-purple border border-surface-dim' : 'text-chocolate-light hover:text-chocolate border border-transparent'
              }`}
            >
              <Database size={16} /> 榜单数据管理
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-chocolate-light hidden sm:inline-block">{user.email}</span>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 bg-surface-container-low hover:bg-surface-dim px-4 py-2 rounded-xl text-sm font-bold text-chocolate transition-all"
              >
                <LogOut size={16} /> 退出
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
            >
              <LogIn size={16} /> 管理员登录
            </button>
          )}
        </div>
      </header>
      
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'student' || !user ? (
          <StudentPortal data={dbData} />
        ) : (
          <AdminDashboard data={dbData} setData={handleSetData} />
        )}
      </main>
    </div>
  );
}

