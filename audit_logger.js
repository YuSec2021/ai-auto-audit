/**
 * 审核日志系统 - audit_logger.js
 * 全流程日志记录，同时输出到控制台和本地文件
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 日志级别
const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

// 任务阶段
const PHASES = {
  TASK_INIT: 'TASK_INIT',
  EXCEL_PARSE: 'EXCEL_PARSE',
  RULE_VALIDATION: 'RULE_VALIDATION',
  LLM_TEXT_AUDIT: 'LLM_TEXT_AUDIT',
  LLM_IMAGE_AUDIT: 'LLM_IMAGE_AUDIT',
  REPORT_GENERATION: 'REPORT_GENERATION',
  TASK_COMPLETE: 'TASK_COMPLETE'
};

/**
 * 格式化时间戳为 YYYYMMDD_HHMMSS
 */
function formatTimestamp(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${mo}${d}_${h}${mi}${s}`;
}

/**
 * 生成日志文件名
 */
function generateLogFilename() {
  const timestamp = formatTimestamp(new Date());
  return `audit_${timestamp}.log`;
}

/**
 * AuditLogger 类
 */
class AuditLogger {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.taskId - 任务ID（可选，默认自动生成UUID）
   * @param {string} options.taskName - 任务名称
   * @param {string} options.inputFile - 输入文件路径
   * @param {number} options.rowCount - 输入数据行数
   * @param {string} options.logsDir - 日志目录（默认 ./logs）
   */
  constructor(options = {}) {
    this.taskId = options.taskId || crypto.randomUUID();
    this.taskName = options.taskName || '审核任务';
    this.inputFile = options.inputFile || '';
    this.rowCount = options.rowCount || 0;
    this.logsDir = options.logsDir || './logs';
    this.startTime = new Date();

    // 确保日志目录存在
    this._ensureLogsDir();

    // 生成日志文件路径
    this.logFile = path.join(this.logsDir, generateLogFilename());

    // 初始化文件写入流
    this.stream = null;
    this._initStream();

    // 注册进程退出处理器
    this._registerExitHandler();

    // 是否降级到控制台输出
    this.fallbackToConsole = false;
  }

  /**
   * 确保日志目录存在
   */
  _ensureLogsDir() {
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (err) {
      console.warn(`[audit_logger] 创建日志目录失败: ${err.message}, 将降级到控制台输出`);
      this.fallbackToConsole = true;
    }
  }

  /**
   * 初始化文件写入流
   */
  _initStream() {
    if (this.fallbackToConsole) return;

    try {
      // 使用追加模式打开文件
      this.stream = fs.createWriteStream(this.logFile, {
        flags: 'a',
        encoding: 'utf8',
        autoClose: true
      });

      this.stream.on('error', (err) => {
        console.error(`[audit_logger] 文件写入错误: ${err.message}`);
        this.fallbackToConsole = true;
        this.stream = null;
      });
    } catch (err) {
      console.warn(`[audit_logger] 初始化文件流失败: ${err.message}, 将降级到控制台输出`);
      this.fallbackToConsole = true;
    }
  }

  /**
   * 注册进程退出处理器
   */
  _registerExitHandler() {
    const self = this;
    process.on('exit', (code) => {
      self._flush();
    });

    // 捕获 SIGINT 和 SIGTERM
    process.on('SIGINT', () => {
      self.close().then(() => process.exit(0));
    });

    process.on('SIGTERM', () => {
      self.close().then(() => process.exit(0));
    });
  }

  /**
   * 刷新缓冲区
   */
  _flush() {
    if (this.stream) {
      try {
        this.stream.flush?.();
      } catch (err) {
        // ignore
      }
    }
  }

  /**
   * 序列化日志条目为JSON字符串
   */
  _serialize(level, phase, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      phase,
      message,
      context: {
        taskId: this.taskId,
        ...context
      }
    };
    return JSON.stringify(entry);
  }

  /**
   * 写入日志
   */
  _write(level, phase, message, context = {}) {
    const jsonLine = this._serialize(level, phase, message, context);
    const consoleLine = `[${level}] [${phase}] ${message} ${JSON.stringify(context)}`;

    // 控制台输出
    console.log(consoleLine);

    // 文件输出（如果不是降级模式）
    if (!this.fallbackToConsole && this.stream) {
      try {
        this.stream.write(jsonLine + '\n');
      } catch (err) {
        console.error(`[audit_logger] 写入文件失败: ${err.message}`);
        this.fallbackToConsole = true;
      }
    }
  }

  /**
   * 记录 INFO 级别日志
   */
  info(phase, message, context = {}) {
    this._write(LOG_LEVELS.INFO, phase, message, context);
  }

  /**
   * 记录 WARN 级别日志
   */
  warn(phase, message, context = {}) {
    this._write(LOG_LEVELS.WARN, phase, message, context);
  }

  /**
   * 记录 ERROR 级别日志
   */
  error(phase, message, context = {}) {
    const errorContext = {
      ...context,
      error: context.error || message
    };
    if (context.stack) {
      errorContext.stack = context.stack;
    }
    this._write(LOG_LEVELS.ERROR, phase, message, errorContext);
  }

  /**
   * 关闭日志写入流
   */
  async close() {
    if (this.stream) {
      return new Promise((resolve) => {
        this.stream.end(() => {
          this.stream = null;
          resolve();
        });
      });
    }
  }

  /**
   * 获取任务ID
   */
  getTaskId() {
    return this.taskId;
  }

  /**
   * 获取日志文件路径
   */
  getLogFile() {
    return this.logFile;
  }
}

/**
 * 创建 AuditLogger 实例的工厂函数
 */
function createAuditLogger(options = {}) {
  return new AuditLogger(options);
}

// 导出
module.exports = {
  createAuditLogger,
  AuditLogger,
  LOG_LEVELS,
  PHASES
};
