import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send, MessageCircle, X } from 'lucide-react';
import styles from './ChatPanel.module.css';

const ChatPanel = ({
  messages = [],
  peerTyping = false,
  onSendMessage = () => {},
  onTyping = () => {},
  onClose = () => {},
  partnerName = 'Partner',
}) => {
  const [chatMessage, setChatMessage] = useState('');
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, peerTyping]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = chatMessage.trim();
    if (trimmed) {
      onSendMessage(trimmed);
      setChatMessage('');
    }
  }, [chatMessage, onSendMessage]);

  const handleInputChange = (e) => {
    setChatMessage(e.target.value);
    onTyping();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className={styles.panel}>
      {/* Minimal Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <MessageCircle size={16} />
          <span>Chat with {partnerName}</span>
        </div>
        <button onClick={onClose} className={styles.closeBtn}>
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <MessageCircle size={24} />
            <p>No messages yet</p>
            <span>Say hello!</span>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const showAvatar = idx === 0 || messages[idx - 1]?.isOwn !== msg.isOwn;
            return (
              <div
                key={msg.id || idx}
                className={`${styles.row} ${msg.isOwn ? styles.rowOwn : styles.rowOther}`}
              >
                {!msg.isOwn && showAvatar && (
                  <div className={styles.avatar}>
                    {(msg.senderName || partnerName || 'P')[0].toUpperCase()}
                  </div>
                )}
                <div className={`${styles.bubble} ${msg.isOwn ? styles.bubbleOwn : styles.bubbleOther}`}>
                  {!msg.isOwn && showAvatar && (
                    <span className={styles.senderName}>{msg.senderName || partnerName}</span>
                  )}
                  <p>{msg.text || msg.message}</p>
                  <span className={styles.time}>{formatTime(msg.timestamp)}</span>
                </div>
              </div>
            );
          })
        )}
        
        {peerTyping && (
          <div className={styles.typing}>
            <div className={styles.typingBubble}>
              <span className={styles.dot} />
              <span className={styles.dot} style={{ animationDelay: '0.15s' }} />
              <span className={styles.dot} style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}
        
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <input
            ref={inputRef}
            type="text"
            value={chatMessage}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className={styles.input}
            maxLength={500}
          />
          <button
            onClick={handleSend}
            disabled={!chatMessage.trim()}
            className={styles.sendBtn}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
