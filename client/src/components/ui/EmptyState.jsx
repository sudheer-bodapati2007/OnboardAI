// src/components/ui/EmptyState.jsx
import React from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here', description = '', action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-200 mb-1">{title}</h3>
      {description && <p className="text-gray-400 text-sm max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

