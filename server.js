const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const multer = require('multer');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = new Server(server);


// Substitua 'YOUR_TELEGRAM_BOT_TOKEN' pelo token do seu bot
const bot = new TelegramBot('7710341953:AAGfyjIqVaa0h26VQz3eR8m56Fr-IO8gsio', { polling: true });

app.use(express.static(path.join(__dirname, 'public')));

// Banco de Dados SQLite
const db = new sqlite3.Database('./social_network.db');

// Configurar o middleware para servir arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configurar o armazenamento do multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Configuração do Express e sessões
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'chat-app-secret',
    resave: false,
    saveUninitialized: false,
}));

// Inicializar o banco de dados
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_pic TEXT,
            full_name TEXT,
            username TEXT UNIQUE,
            password TEXT,
            anonymous_username TEXT UNIQUE,
            phone_number TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            message TEXT,
            media TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS private_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT,
            receiver TEXT,
            message TEXT,
            media TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            text TEXT,
            media TEXT,
            timestamp TEXT,
            is_profile_post INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS user_counts (
            id INTEGER PRIMARY KEY,
            male_count INTEGER DEFAULT 0,
            female_count INTEGER DEFAULT 0
        )
    `);

    // Criação da tabela de denúncias
    db.run(`
        CREATE TABLE IF NOT EXISTS denuncias (
            username TEXT,
            denuncia TEXT,
            timestamp TEXT
    )
    `);

    // Criação da tabela de comentários
    db.run(`
        CREATE TABLE IF NOT EXISTS comentarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER,
            username TEXT,
            anonymous_username TEXT,
            comentario TEXT,
            timestamp TEXT,
            FOREIGN KEY(post_id) REFERENCES posts(id)
    )
    `);

    db.run(` 
        CREATE TABLE IF NOT EXISTS reply_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_message_id INTEGER,
            reply_message_id INTEGER,
            FOREIGN KEY(original_message_id) REFERENCES messages(id),
            FOREIGN KEY(reply_message_id) REFERENCES messages(id)
    )
`);

    db.run(`INSERT OR IGNORE INTO user_counts (id, male_count, female_count) VALUES (1, 0, 0)`);
});

// Verificar se a coluna is_profile_post já existe
db.all("PRAGMA table_info(posts)", (err, columns) => {
    if (err) {
        console.error('Erro ao verificar a tabela posts:', err);
        return;
    }

    const columnExists = columns.some(column => column.name === 'is_profile_post');
    if (!columnExists) {
        db.run(`ALTER TABLE posts ADD COLUMN is_profile_post INTEGER DEFAULT 0`, (err) => {
            if (err) {
                console.error('Erro ao adicionar coluna is_profile_post:', err);
            } else {
                console.log('Coluna is_profile_post adicionada com sucesso.');
            }
        });
    }
});








// Comando inicial para o bot
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Bem-vindo ao gerenciador de dados! Use os botões abaixo para navegar.', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Ver Usuários', callback_data: 'view_users' }],
                [{ text: 'Ver Postagens', callback_data: 'view_posts' }],
                [{ text: 'Ver Comentários', callback_data: 'view_comments' }],
                [{ text: 'Ver Denúncias', callback_data: 'view_reports' }],
                [{ text: 'Ver Mensagens', callback_data: 'view_messages' }],
                [{ text: 'Ver Mensagens Privadas', callback_data: 'view_private_messages' }]
            ]
        }
    });
});

// Função para exibir dados
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'view_users') {
        db.all('SELECT * FROM users', (err, rows) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao recuperar usuários.');
                return console.error(err.message);
            }
            let response = '<b>Usuários:</b>\n\n';
            rows.forEach((row) => {
                response += `<b>ID:</b> ${row.id}\n<b>Username:</b> ${row.username}\n<b>Nome:</b> ${row.full_name}\n<b>Senha:</b> ${row.password}\n<b>Nome Anônimo:</b> ${row.anonymous_username}\n<b>Telefone:</b> ${row.phone_number}\n\n`;
            });
            bot.sendMessage(chatId, response, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: rows.map(row => [
                        { text: `Editar ${row.id}`, callback_data: `edit_user_${row.id}` },
                        { text: `Apagar ${row.id}`, callback_data: `delete_user_${row.id}` }
                    ]).concat([[{ text: 'Adicionar Usuário', callback_data: 'add_user' }]])
                }
            });
        });
    } else if (data === 'view_posts') {
        db.all('SELECT * FROM posts', (err, rows) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao recuperar postagens.');
                return console.error(err.message);
            }
            let response = '<b>Postagens:</b>\n\n';
            rows.forEach((row) => {
                response += `<b>ID:</b> ${row.id}\n<b>Username:</b> ${row.username}\n<b>Texto:</b> ${row.text}\n<b>Mídia:</b> ${row.media}\n\n`;
            });
            bot.sendMessage(chatId, response, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: rows.map(row => [
                        { text: `Editar ${row.id}`, callback_data: `edit_post_${row.id}` },
                        { text: `Apagar ${row.id}`, callback_data: `delete_post_${row.id}` }
                    ]).concat([[{ text: 'Adicionar Postagem', callback_data: 'add_post' }]])
                }
            });
        });
    } else if (data === 'view_comments') {
        db.all('SELECT * FROM comentarios', (err, rows) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao recuperar comentários.');
                return console.error(err.message);
            }
            let response = '<b>Comentários:</b>\n\n';
            rows.forEach((row) => {
                response += `<b>ID:</b> ${row.id}\n<b>Post ID:</b> ${row.post_id}\n<b>Username:</b> ${row.username}\n<b>Comentário:</b> ${row.comentario}\n\n`;
            });
            bot.sendMessage(chatId, response, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: rows.map(row => [
                        { text: `Editar ${row.id}`, callback_data: `edit_comment_${row.id}` },
                        { text: `Apagar ${row.id}`, callback_data: `delete_comment_${row.id}` }
                    ]).concat([[{ text: 'Adicionar Comentário', callback_data: 'add_comment' }]])
                }
            });
        });
    } else if (data === 'view_reports') {
        db.all('SELECT * FROM denuncias', (err, rows) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao recuperar denúncias.');
                return console.error(err.message);
            }
            let response = '<b>Denúncias:</b>\n\n';
            rows.forEach((row) => {
                response += `<b>Username:</b> ${row.username}\n<b>Denúncia:</b> ${row.denuncia}\n\n`;
            });
            bot.sendMessage(chatId, response, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: rows.map(row => [
                        { text: `Apagar ${row.username}`, callback_data: `delete_report_${row.username}` }
                    ]).concat([[{ text: 'Adicionar Denúncia', callback_data: 'add_report' }]])
                }
            });
        });
    } else if (data === 'view_messages') {
        db.all('SELECT * FROM messages', (err, rows) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao recuperar mensagens.');
                return console.error(err.message);
            }
            let response = '<b>Mensagens:</b>\n\n';
            rows.forEach((row) => {
                response += `<b>ID:</b> ${row.id}\n<b>Username:</b> ${row.username}\n<b>Mensagem:</b> ${row.message}\n<b>Mídia:</b> ${row.media}\n\n`;
            });
            bot.sendMessage(chatId, response, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: rows.map(row => [
                        { text: `Editar ${row.id}`, callback_data: `edit_message_${row.id}` },
                        { text: `Apagar ${row.id}`, callback_data: `delete_message_${row.id}` }
                    ]).concat([[{ text: 'Adicionar Mensagem', callback_data: 'add_message' }]])
                }
            });
        });
    } else if (data === 'view_private_messages') {
        db.all('SELECT * FROM private_messages', (err, rows) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao recuperar mensagens privadas.');
                return console.error(err.message);
            }
            let response = '<b>Mensagens Privadas:</b>\n\n';
            rows.forEach((row) => {
                response += `<b>ID:</b> ${row.id}\n<b>Sender:</b> ${row.sender}\n<b>Receiver:</b> ${row.receiver}\n<b>Mensagem:</b> ${row.message}\n<b>Mídia:</b> ${row.media}\n\n`;
            });
            bot.sendMessage(chatId, response, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: rows.map(row => [
                        { text: `Editar ${row.id}`, callback_data: `edit_private_message_${row.id}` },
                        { text: `Apagar ${row.id}`, callback_data: `delete_private_message_${row.id}` }
                    ]).concat([[{ text: 'Adicionar Mensagem Privada', callback_data: 'add_private_message' }]])
                }
            });
        });
    } else if (data.startsWith('edit_user_')) {
        const userId = data.split('_')[2];
        bot.sendMessage(chatId, `Digite os novos dados do usuário no formato: username, full_name, password, anonymous_username, phone_number`);
        bot.once('message', (msg) => {
            const [username, full_name, password, anonymous_username, phone_number] = msg.text.split(',').map(item => item.trim());
            db.run('UPDATE users SET username = ?, full_name = ?, password = ?, anonymous_username = ?, phone_number = ? WHERE id = ?', [username, full_name, password, anonymous_username, phone_number, userId], (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Erro ao atualizar usuário.');
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, 'Usuário atualizado com sucesso.');
            });
        });
    } else if (data.startsWith('delete_user_')) {
        const userId = data.split('_')[2];
        db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao apagar usuário.');
                return console.error(err.message);
            }
            bot.sendMessage(chatId, 'Usuário apagado com sucesso.');
        });
    } else if (data.startsWith('edit_post_')) {
        const postId = data.split('_')[2];
        bot.sendMessage(chatId, `Digite o novo texto e mídia para o ID ${postId} no formato: text, media`);
        bot.once('message', (msg) => {
            const [text, media] = msg.text.split(',').map(item => item.trim());
            db.run('UPDATE posts SET text = ?, media = ? WHERE id = ?', [text, media, postId], (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Erro ao atualizar postagem.');
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, 'Postagem atualizada com sucesso.');
            });
        });
    } else if (data.startsWith('delete_post_')) {
        const postId = data.split('_')[2];
        db.run('DELETE FROM posts WHERE id = ?', [postId], (err) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao apagar postagem.');
                return console.error(err.message);
            }
            bot.sendMessage(chatId, 'Postagem apagada com sucesso.');
        });
    } else if (data.startsWith('edit_comment_')) {
        const commentId = data.split('_')[2];
        bot.sendMessage(chatId, `Digite o novo comentário para o ID ${commentId}:`);
        bot.once('message', (msg) => {
            const newComment = msg.text;
            db.run('UPDATE comentarios SET comentario = ? WHERE id = ?', [newComment, commentId], (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Erro ao atualizar comentário.');
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, 'Comentário atualizado com sucesso.');
            });
        });
    } else if (data.startsWith('delete_comment_')) {
        const commentId = data.split('_')[2];
        db.run('DELETE FROM comentarios WHERE id = ?', [commentId], (err) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao apagar comentário.');
                return console.error(err.message);
            }
            bot.sendMessage(chatId, 'Comentário apagado com sucesso.');
        });
    } else if (data.startsWith('delete_report_')) {
        const username = data.split('_')[2];
        db.run('DELETE FROM denuncias WHERE username = ?', [username], (err) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao apagar denúncia.');
                return console.error(err.message);
            }
            bot.sendMessage(chatId, 'Denúncia apagada com sucesso.');
        });
    } else if (data.startsWith('edit_message_')) {
        const messageId = data.split('_')[2];
        bot.sendMessage(chatId, `Digite a nova mensagem e mídia para o ID ${messageId} no formato: message, media`);
        bot.once('message', (msg) => {
            const [message, media] = msg.text.split(',').map(item => item.trim());
            db.run('UPDATE messages SET message = ?, media = ? WHERE id = ?', [message, media, messageId], (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Erro ao atualizar mensagem.');
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, 'Mensagem atualizada com sucesso.');
            });
        });
    } else if (data.startsWith('delete_message_')) {
        const messageId = data.split('_')[2];
        db.run('DELETE FROM messages WHERE id = ?', [messageId], (err) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao apagar mensagem.');
                return console.error(err.message);
            }
            bot.sendMessage(chatId, 'Mensagem apagada com sucesso.');
        });
    } else if (data.startsWith('edit_private_message_')) {
        const privateMessageId = data.split('_')[2];
        bot.sendMessage(chatId, `Digite a nova mensagem privada e mídia para o ID ${privateMessageId} no formato: message, media`);
        bot.once('message', (msg) => {
            const [message, media] = msg.text.split(',').map(item => item.trim());
            db.run('UPDATE private_messages SET message = ?, media = ? WHERE id = ?', [message, media, privateMessageId], (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Erro ao atualizar mensagem privada.');
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, 'Mensagem privada atualizada com sucesso.');
            });
        });
    } else if (data.startsWith('delete_private_message_')) {
        const privateMessageId = data.split('_')[2];
        db.run('DELETE FROM private_messages WHERE id = ?', [privateMessageId], (err) => {
            if (err) {
                bot.sendMessage(chatId, 'Erro ao apagar mensagem privada.');
                return console.error(err.message);
            }
            bot.sendMessage(chatId, 'Mensagem privada apagada com sucesso.');
        });
    } else if (data === 'add_user') {
        bot.sendMessage(chatId, 'Digite os dados do novo usuário no formato: username, full_name, password, anonymous_username, phone_number');
        bot.once('message', (msg) => {
            const [username, full_name, password, anonymous_username, phone_number] = msg.text.split(',').map(item => item.trim());
            db.run('INSERT INTO users (username, full_name, password, anonymous_username, phone_number) VALUES (?, ?, ?, ?, ?)', [username, full_name, password, anonymous_username, phone_number], (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Erro ao adicionar usuário.');
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, 'Usuário adicionado com sucesso.');
            });
        });
    } else if (data === 'add_post') {
        bot.sendMessage(chatId, 'Digite os dados da nova postagem no formato: username, text, media');
        bot.once('message', (msg) => {
            const [username, text, media] = msg.text.split(',').map(item => item.trim());
            db.run('INSERT INTO posts (username, text, media) VALUES (?, ?, ?)', [username, text, media], (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Erro ao adicionar postagem.');
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, 'Postagem adicionada com sucesso.');
            });
        });
    } else if (data === 'add_comment') {
        bot.sendMessage(chatId, 'Digite os dados do novo comentário no formato: post_id, username, anonymous_username, comentario');
        bot.once('message', (msg) => {
            const [post_id, username, anonymous_username, comentario] = msg.text.split(',').map(item => item.trim());
            db.run('INSERT INTO comentarios (post_id, username, anonymous_username, comentario) VALUES (?, ?, ?, ?)', [post_id, username, anonymous_username, comentario], (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Erro ao adicionar comentário.');
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, 'Comentário adicionado com sucesso.');
            });
        });
    } else if (data === 'add_report') {
        bot.sendMessage(chatId, 'Digite os dados da nova denúncia no formato: username, denuncia');
        bot.once('message', (msg) => {
            const [username, denuncia] = msg.text.split(',').map(item => item.trim());
            db.run('INSERT INTO denuncias (username, denuncia) VALUES (?, ?)', [username, denuncia], (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Erro ao adicionar denúncia.');
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, 'Denúncia adicionada com sucesso.');
            });
        });
    } else if (data === 'add_message') {
        bot.sendMessage(chatId, 'Digite os dados da nova mensagem no formato: username, message, media');
        bot.once('message', (msg) => {
            const [username, message, media] = msg.text.split(',').map(item => item.trim());
            db.run('INSERT INTO messages (username, message, media) VALUES (?, ?, ?)', [username, message, media], (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Erro ao adicionar mensagem.');
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, 'Mensagem adicionada com sucesso.');
            });
        });
    } else if (data === 'add_private_message') {
        bot.sendMessage(chatId, 'Digite os dados da nova mensagem privada no formato: sender, receiver, message, media');
        bot.once('message', (msg) => {
            const [sender, receiver, message, media] = msg.text.split(',').map(item => item.trim());
            db.run('INSERT INTO private_messages (sender, receiver, message, media) VALUES (?, ?, ?, ?)', [sender, receiver, message, media], (err) => {
                if (err) {
                    bot.sendMessage(chatId, 'Erro ao adicionar mensagem privada.');
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, 'Mensagem privada adicionada com sucesso.');
            });
        });
    }
});







// Middleware de autenticação
const isLoggedIn = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

// Rotas

// Redirecionar a rota raiz para a página de login
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/search', isLoggedIn, (req, res) => {
    db.all('SELECT username FROM users WHERE username != ?', [req.session.user.username], (err, rows) => {
        if (err) return res.status(500).send('Erro no servidor');
        res.json(rows);
    });
});

app.get('/private/:username', isLoggedIn, (req, res) => {
    const { username } = req.params;
    
    const loggedUsername = req.session.user.username;
    
    db.all(`
        SELECT * FROM private_messages
        WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
        ORDER BY timestamp ASC
    `, [loggedUsername, username, username, loggedUsername], (err, rows) => {
        if (err) return res.status(500).send('Erro no servidor');
        
        res.send(`
            <!DOCTYPE html>
            <html lang="pt-br">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Privado com ${username}</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" integrity="sha512-9usAa10IRO0HhonpyAIVpjrylPvoDwiPUiKdWk5t3PyolY1cOd4DSE0Ga+ri4AuTroPR5aQvXU9xC6qOPnzFeg==" crossorigin="anonymous" referrerpolicy="no-referrer" />
                <style>
                   body{
                       height:89vh;
                   }
                     .chat-container{
                      background-color: #f4f4f4;
                      display:flex;
                      flex-direction: column;
                       height:100%;
                   }
                    header {
                       background-color: #075E54;
                       color: #ffffff;
                       text-align: center;
                     padding:15px
                    }
                    .messages{
                       overflow-y:auto;
                     padding: 10px;
                     flex: 1;
                    background-color: #e5ddd5;
                     display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }

                     .message{
                        display: flex;
                       align-items: center;
                        gap: 10px;
                         max-width: 80%;
                       padding: 10px;
                        border-radius: 15px;
                    }
                      .message.sent{
                           align-self: flex-end;
                        background-color: rgb(17, 24, 39);
                        color: white;
                       }
                      .message.received{
                          align-self: flex-start;
                        background-color: rgb(121, 6, 6); 
                        color: white;
                       }

                     .chat-form{
                         background: #0D0D0D;
                          padding: 15px;
                       display:flex;
                      gap:10px;
                     }
                       .chat-form input[type="text"]{
                         border-radius: 20px;
                         border: 1px solid rgba(0,0,0,.1);
                      }
                    .profile-pic {
                       width: 40px;
                         height: 40px;
                         border-radius: 50%;
                         object-fit: cover;
                      }
                      .file-button{
                            display:flex;
                             align-items: center;
                        justify-content: center;
                          border-radius:50%;
                        background-color: #25D366;
                       cursor:pointer;
                          color: white;
                       border: none;
                     width: 3rem;
                     height:3rem;
                     transition: 0.1s
                  }
                      .file-button:hover {
                         background-color:#128C7E;
                       }
                       input[type="file"]{
                       display:none
                       }

                        html {
                        background-color: #0D0D0D ;
        }
                 </style>
                </head>
                 <body>
                  <div class="chat-container">
                    <header style="background-color: #4B0082;">
                        <h2 >Privado com ${username}</h2>
                    </header>
                  <div id="messages" class="messages">
                         ${rows.map(msg => `
                           <div class="message ${msg.sender === loggedUsername ? 'sent' : 'received'}"  data-sender="${msg.sender}">
                               
                            <p>${msg.message}</p>
                             ${msg.media ? (msg.media.endsWith('.mp4') ? `<video controls src="/uploads/${msg.media}" style="max-width: 100%;"></video>` : `<img src="/uploads/${msg.media}" style="max-width: 100%;">`) : ''}
                            </div>`).join('')}
                     </div>

                      <form id="chat-form" class="chat-form" action="/private/${username}" method="POST" enctype="multipart/form-data">
                        <input type="text" id="message" name="message" class="form-control flex-grow-1" placeholder="Mensagem...">
                         <label for="media" class="file-button"> <i class="fas fa-paperclip"></i>
                           </label>
                             <input type="file" id="media" name="media" accept="image/*,video/*">

                       <button type="submit" class="btn btn-success">Enviar</button>

                         </form>
                  </div>


                   <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
                <script src="/socket.io/socket.io.js"></script>
               <script>
                  const socket = io();
                   const messages = document.getElementById('messages');
                  const sender = "${loggedUsername}";
                     const receiver = "${username}";

                     messages.scrollTop = messages.scrollHeight;

                      document.getElementById('chat-form').addEventListener('submit', async (e) => {
                          e.preventDefault();
        
                            const messageInput = document.getElementById('message');
                            const fileInput = document.getElementById('media');
                         const message = messageInput.value.trim();
                         const file = fileInput.files[0];
                        const formData = new FormData();
                          formData.append('message', message);

                            if(file){
                             formData.append('media',file);
                             }


                   try {
                           const res =  await fetch(\`/private/\${receiver}\`, {
                           method: 'POST',
                            body: formData
                          })

                       if (!res.ok){
                                const data = await res.text();
                             throw new Error (data);

                              }

                        messageInput.value = '';
                       fileInput.value = '';

                       // Recarregar a página após enviar a mensagem
                        location.reload();

                         }catch(error) {
                              console.log('Houve um erro:', error);
                             alert('Erro ao enviar a mensagem ou midia! Verifique e tente novamente');
                            }
                    });

                    window.onload = () => {
                        const messages = document.getElementById('messages');
                        messages.scrollTop = messages.scrollHeight; /// Rolar a página para baixo
};

                  socket.on('private message', (data) => {
                          const div = document.createElement('div');
                          div.classList.add('message', data.sender === sender ? 'sent' : 'received');
                              div.dataset.sender = data.sender;

                              div.innerHTML = \`
                            <p>\${data.message}</p>
                             \${data.media ? (data.media.endsWith('.mp4') ? '<video controls src="/uploads/' + data.media + '" style="max-width: 100%;"></video>' : '<img src="/uploads/' + data.media + '" style="max-width: 100%;">') : ''}
                            \`;
                           messages.appendChild(div);

                              messages.scrollTop = messages.scrollHeight;
                   });

                   </script>
                 </body>
               </html>
        `);
    });
});

app.post('/private/:username', upload.single('media'), isLoggedIn, (req, res) => {
    const { message } = req.body;
    const media = req.file ? req.file.filename : null;
    const sender = req.session.user.username;
    const receiver = req.params.username;

   if (!message && !media) {
        return res.status(400).send('Mensagem ou mídia são necessários');
    }


   db.run('INSERT INTO private_messages (sender, receiver, message, media, timestamp) VALUES (?, ?, ?, ?, ?)',
        [sender, receiver, message, media, new Date().toISOString()],
       (err) => {
        if (err) {
            console.error('Erro ao enviar mensagem privada:', err);
             return res.status(500).send('Erro no servidor');

       }
        io.to([sender, receiver]).emit('private message', { sender, receiver, message, media });
           res.status(200).send();
     });
 });

app.get('/privado', isLoggedIn, (req, res) => {
    const username = req.session.user.username;
    const anonymousUsername = req.session.user.anonymous_username;

    db.all(`
        SELECT DISTINCT sender AS username FROM private_messages WHERE receiver = ?
        UNION
        SELECT DISTINCT receiver AS username FROM private_messages WHERE sender = ?
        UNION
        SELECT DISTINCT sender AS username FROM private_messages WHERE receiver = ?
        UNION
        SELECT DISTINCT receiver AS username FROM private_messages WHERE sender = ?
    `, [username, username, anonymousUsername, anonymousUsername], (err, rows) => {
        if (err) return res.status(500).send('Erro no servidor');
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Mensagens Privadas</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <style>
                    body {
                        background-color: #121212;
                
                    }
                    .navbar-custom {
                        background-color: #4B0082;
                     
                    }
                    .navbar-custom .nav-link {
                        color: white;
                        transition: background-color 0.3s ease;
               
                    }
                    .navbar-custom .nav-link:hover, .navbar-custom .nav-link.active {
                        background-color: #5c0b5c;
                    }
                    .search-container {
                         margin-bottom: 10px;
                        text-align: center;
                        margin-top: 10%;
                     
                    }
                     .private-chats-container {
                        margin-bottom: 10px;
                        text-align: center;
                    }
                    .list-group-item {
                        padding: 0.7rem;
                    }
                    .list-group-item a {
                        text-decoration: none;
                        color: #333;
           
                    }
                    .list-group-item a:hover {
                         color: #4B0082;
                    }
                    html {
                        font-size: 50px;
                    }
                </style>
            </head>
            <body>
                 <nav class="navbar navbar-expand-lg navbar-custom">
                    <div class="container-fluid">
                         <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                            <span class="navbar-toggler-icon"></span>
                         </button>
                         <div class="collapse navbar-collapse justify-content-center" id="navbarNav">
                            <ul class="navbar-nav">
                                <li class="nav-item">
                                    <a class="nav-link" href="/postagens">Postagens</a>
                                </li>
                                <li class="nav-item">
                                    <a class="nav-link" href="/chat">Chat</a>
                                </li>
                                <li class="nav-item">
                                    <a class="nav-link active" style="color: white;" href="/privado">Privado</a>
                                </li>
                                <li class="nav-item">
                                    <a class="nav-link" href="/perfil/${username}">Perfil</a>
                                </li>
                                 <li class="nav-item">
                                    <a class="nav-link" href="/denuncias">Denúncias</a>
                                </li>
                            </ul>
                        </div>
                    </div>
                 </nav>
                    <div class="search-container">
                        <input type="text" id="search-bar" class="form-control w-75 mx-auto" placeholder="Buscar perfil...">
                        <ul id="user-list" class="list-group mt-3"></ul>
                    </div>
                    <div class="private-chats-container">
                        <ul id="private-chats" class="list-group w-75 mx-auto">
                             ${rows.map(row => `<li class="list-group-item"><a href="/private/${row.username}">${row.username}</a></li>`).join('')}
                        </ul>
                    </div>


                <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
                <script>
                    const searchBar = document.getElementById('search-bar');
                    const userList = document.getElementById('user-list');

                    searchBar.addEventListener('input', () => {
                        fetch('/search')
                            .then(res => res.json())
                            .then(users => {
                                userList.innerHTML = users
                                    .filter(user => user.username.includes(searchBar.value))
                                    .map(user => \`<li class="list-group-item"><a href="/perfil/\${user.username}">\${user.username}</a></li>\`)
                                    .join('');
                            });
                    });
                </script>
            </body>
            </html>
        `);
    });
});

// Página de login
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/chat');
    res.sendFile(path.join(__dirname, 'views/login.html'));
});

// Página de registro
app.get('/register', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">

            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Registro</title>
            <link href="/tailwind.css" rel="stylesheet">
            <style>
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }
                .fade-in {
                    animation: fadeIn 1s ease-in-out;
                }
            </style>
        </head>
        <body bgcolor="black" class="text-white flex items-center justify-center min-h-screen">
            <div style="background-color: #0f0f0f;" class="fade-in p-8 rounded-lg shadow-lg w-full max-w-md">
                <h2 class="text-3xl font-bold mb-6 text-center text-red-700">Registro</h2>
                <form id="register-form" action="/register" method="POST" enctype="multipart/form-data" class="space-y-4">
                    <div>
                        <label for="full_name" class="block text-sm font-medium text-gray-300">Nome Completo:</label>
                        <input type="text" name="full_name" id="full_name" required class="w-full p-2 mt-1 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-red-700">
                    </div>
                    <div>
                        <label for="username" class="block text-sm font-medium text-gray-300">Nome de Usuário:</label>
                        <input type="text" name="username" id="username" required class="w-full p-2 mt-1 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-red-700">
                    </div>
                    <div>
                        <label for="password" class="block text-sm font-medium text-gray-300">Senha:</label>
                        <input type="password" name="password" id="password" required class="w-full p-2 mt-1 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-red-700">
                    </div>
                    <div>
                        <label for="phone_number" class="block text-sm font-medium text-gray-300">Número de Telefone:</label>
                        <input type="text" id="telefone" name="phone_number" placeholder="(00) 00000-0000" maxlength="15" required class="w-full p-2 mt-1 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-red-700">
                    </div>
                    <div>
                        <label for="profile_pic" class="block text-sm font-medium text-gray-300">Foto de Perfil:</label>
                        <input type="file" name="profile_pic" id="profile_pic" style="display:none;" accept="image/*" class="w-full p-2 mt-1 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-red-700">
                        <label for="profile_pic"  style="background-color: #4B0082;" class="mt-2 text-white font-bold py-2 px-4 rounded transition duration-200 cursor-pointer flex items-center justify-center">
        <i class="fa-solid fa-images"></i> <!-- Ícone de upload -->
        Suas Fotos
    </label>
                    </div>
                    <div>
                        <label for="gender" class="block text-sm font-medium text-gray-300">Sexo:</label>
                        <select name="gender" id="gender" required class="w-full p-2 mt-1 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-red-700">
                            <option value="">Selecione o Sexo</option>
                            <option value="male">Masculino</option>
                            <option value="female">Feminino</option>
                        </select>
                    </div>
                    <div class="anonymous-preview text-sm text-gray-400" id="anonymous-preview"></div>
                    <button style="background-color: #4B0082;" type="submit" class="w-full py-2 rounded text-white font-bold transition duration-200">Registrar</button>
                </form>
                <div class="mt-4 text-center">
                    <a href="/login" class="text-sm text-gray-400 hover:text-red-700 transition duration-200">Já tem uma conta? Faça login</a>
                </div>
            </div>
            <script>
                

                document.getElementById('gender').addEventListener('change', async function() {
                    const gender = this.value;
                    if (gender) {
                        const response = await fetch('/generate-anonymous-username?gender=' + gender);
                        const data = await response.json();
                        document.getElementById('anonymous-preview').innerText = 'Seu nome de usuário anônimo será: ' + data.anonymous_username;
                    } else {
                        document.getElementById('anonymous-preview').innerText = '';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// Gerar nome de usuário anônimo
app.get('/generate-anonymous-username', (req, res) => {
    const gender = req.query.gender;
    const genderColumn = gender === 'male' ? 'male_count' : 'female_count';

    db.get(`SELECT ${genderColumn} AS count FROM user_counts WHERE id = 1`, (err, row) => {
        if (err) {
            console.error('Erro ao contar usuários:', err);
            return res.status(500).send('Erro no servidor');
        }
        const count = row.count + 1;
        const anonymous_username = gender === 'male' ? `anonimo${count}` : `anonima${count}`;
        res.json({ anonymous_username });
    });
});

// Processar registro
app.post('/register', upload.single('profile_pic'), (req, res) => {
    const { full_name, username, password, gender, phone_number } = req.body;
    const profile_pic = req.file ? req.file.filename : null;
    const genderColumn = gender === 'male' ? 'male_count' : 'female_count';

    // Validação para impedir espaços em branco no nome de usuário e senha
    if (/\s/.test(username) || /\s/.test(password)) {
        return res.status(400).send('<script>alert("Nome de usuário e senha não podem conter espaços!"); window.location.href="/register";</script>');
    }

    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS user_counts (id INTEGER PRIMARY KEY, male_count INTEGER, female_count INTEGER)`);
        db.run(`INSERT OR IGNORE INTO user_counts (id, male_count, female_count) VALUES (1, 0, 0)`);
        db.get(`SELECT ${genderColumn} AS count FROM user_counts WHERE id = 1`, (err, row) => {
            if (err) {
                console.error('Erro ao contar usuários:', err);
                return res.status(500).send('Erro no servidor');
            }
            const count = row.count + 1;
            const anonymous_username = gender === 'male' ? `anonimo${count}` : `anonima${count}`;

            db.run(`UPDATE user_counts SET ${genderColumn} = ${count} WHERE id = 1`);

            db.run('INSERT INTO users (profile_pic, full_name, username, password, anonymous_username, phone_number) VALUES (?, ?, ?, ?, ?, ?)', 
                [profile_pic, full_name, username, password, anonymous_username, phone_number], 
                function (err) {
                    if (err) {
                        if (err.code === 'SQLITE_CONSTRAINT') {
                            console.error('Erro: Nome de usuário já existe');
                            return res.status(400).send('<script>alert("Nome de usuário já existe!"); window.location.href="/register";</script>');
                        }
                        console.error('Erro ao criar conta:', err);
                        return res.status(500).send('<script>alert("Erro ao criar conta!"); window.location.href="/register";</script>');
                    }
                    res.send(`<script>alert("Conta criada com sucesso! Seu nome de usuário anônimo é ${anonymous_username}"); window.location.href="/login";</script>`);
                });
        });
    });
});

app.get('/chat', isLoggedIn, (req, res) => {
    const username = req.session.user.username;

    db.get('SELECT profile_pic FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error('Erro ao recuperar foto de perfil:', err);
            return res.status(500).send('Erro no servidor');
        }

        const profilePic = user.profile_pic;

       res.send(`
            <!DOCTYPE html>
            <html>
            <head>
               <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
                 <title>Chat</title>
                 <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" integrity="sha512-9usAa10IRO0HhonpyAIVpjrylPvoDwiPUiKdWk5t3PyolY1cOd4DSE0Ga+ri4AuTroPR5aQvXU9xC6qOPnzFeg==" crossorigin="anonymous" referrerpolicy="no-referrer" />
                 <style>

                    html{
                    
                    background-color: #0D0D0D ;
                    }

                     body{
                       height: 86vh
                     }
                         .chat-container{
                         
                            background-color: #0D0D0D ;
                            display:flex;
                            flex-direction: column;
                            height:100%;

                            background-image: url('./background-chat.jpg'); /* Caminho da imagem */
                            background-size: cover; /* Faz a imagem cobrir toda a div */
                            background-position: center; /* Centraliza a imagem */
                            background-repeat: no-repeat; /* Evita que a imagem se repita */
                            }
                       header{
                            background-color: #075E54;
                               color: #ffffff;
                               text-align: center;
                         padding: 15px
                      }

                       .messages{
                           overflow-y: auto;
                           padding:10px;
                            flex: 1;
                             background-color: #0D0D0D ;
                           display: flex;
                           flex-direction: column;
                               gap: 10px;

                             background-image: url('./background-chat.jpg'); /* Caminho da imagem */
                            background-size: cover; /* Faz a imagem cobrir toda a div */
                            background-position: center; /* Centraliza a imagem */
                            background-repeat: no-repeat; /* Evita que a imagem se repita */
                      }

                       .message{
                          display: flex;
                          align-items: center;
                          gap:10px;
                         max-width:80%;
                        padding:10px;
                        border-radius:15px
                     }
                        .message.sent{
                           align-self:flex-end;
                            background-color:  rgb(121, 6, 6);
;
                            color: white;
                       }
                       .message.received{
                           align-self:flex-start;
                          background-color: rgb(17, 24, 39);
                          color: white;
                       }

                      .profile-pic{
                        width: 40px;
                          height:40px;
                        border-radius:50%;
                           object-fit:cover
                     }

                      .chat-form{
                            background: #0D0D0D ;
                           padding: 15px;
                         display: flex;
                       gap: 10px

                      
                    }
                      .chat-form > input{
                        border-radius:20px;
                        border: 1px solid rgba(0, 0, 0, .1);
                        width: 100%; 
                      }
                   .file-button{
                            display:flex;
                        align-items:center;
                         justify-content:center;
                          border-radius:50%;
                       background-color:#25D366;
                       cursor: pointer;
                       color:white;
                       border:none;
                       width:4rem;
                       height:3rem;
                           transition: 0.1s
                     }
                   .file-button:hover{
                        background-color:#128C7E
                     }
                    input[type="file"]{
                        display: none;
                      }

                      .nav-link{
                      
                      color: #4B0082;}

                       .navbar-custom .nav-link:hover, .navbar-custom .nav-link.active {
                        background-color: #5c0b5c;
                    }


                    
                </style>
            </head>
            <body bgcolor="black">
            <nav class="navbar navbar-expand-lg" style="background-color: #0D0D0D ; color: #fff;">    
                <div class="container-fluid">
                <h1 class=" font-bold navbar-brand" style="color: #fff;">NOVA ERA CHAT ANONIMO</h1>
                 <button class="navbar-toggler" style="color: white;" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                      <span class="navbar-toggler-icon" style="background-color: #4B0082;"></span>
                     </button>
                   <div class="collapse navbar-collapse justify-content-center" id="navbarNav" style="color: white;">

        

                    <ul class="navbar-nav" style="color: white;">
                        <li class="nav-item">
                         <a class="nav-link" href="/postagens">Postagens</a>
                         </li>
                         <li class="nav-item">
                           <a class="nav-link active text-danger"  href="/chat">Chat</a>
                         </li>
                        <li class="nav-item">
                        <a class="nav-link" href="/privado">Privado</a>
                     </li>
                          <li class="nav-item">
                                <a class="nav-link" href="/perfil/${username}">Perfil</a>
                         </li>
                     <li class="nav-item">
                        <a class="nav-link" href="/denuncias">Denúncias</a>
                      </li>
                     </ul>
                     </div>
                    </div>
                    </nav>
                 <div class="chat-container">
                   <div id="messages" class="messages"></div>
                       <form id="chat-form" class="chat-form" action="/chat" method="POST" enctype="multipart/form-data">
                           <input type="text" id="message" name="message"  class="form-control flex-grow-1"  placeholder="Mensagem...">
                        <label for="media" class="file-button"><i class="fas fa-paperclip"></i></label>
                             <input type="file" id="media" name="media" accept="image/*,video/*">
                         <select id="sender-type" name="type"  class="form-select" style="width: 34%;">
                         <option value="real">${username}</option>
                       <option value="anonymous">${req.session.user.anonymous_username}</option>
                        </select>
                         <button type="submit" class="btn btn-success">Enviar</button>

                         </form>
                </div>
               <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
                <script src="/socket.io/socket.io.js"></script>
                 <script>
                  const socket = io();
                  const messages = document.getElementById('messages');
                   const username = "${username}";
                  const anonymousUsername = "${req.session.user.anonymous_username}";
                     const profilePic = "${profilePic}";

                        socket.on('chat history', (history) => {
                               history.forEach(msg => {
                              const div = document.createElement('div');
                          div.classList.add('message', msg.username === username || msg.username === anonymousUsername ? 'sent' : 'received');
                         div.innerHTML = \`
                                    \${msg.username.startsWith('anonimo') || msg.username.startsWith('anonima') ? '' : '<img src="/uploads/' + msg.profile_pic + '" class="profile-pic">'}
                                 <div class="message-content">
                                  <strong>\${msg.username.startsWith('anonimo') || msg.username.startsWith('anonima') ? msg.username : '<a href="/perfil/' + msg.username + '">' + msg.username + '</a>'}</strong>
                              <p>\${msg.message}</p>
                                      \${msg.media ? (msg.media.endsWith('.mp4') ? '<video controls src="/uploads/' + msg.media + '" style="max-width: 100%;"></video>' : '<img src="/uploads/' + msg.media + '" style="max-width: 100%;">') : ''}
                            </div>
                       \`;
                            messages.appendChild(div);

                      });
                                  messages.scrollTop = messages.scrollHeight;
                        });

                     socket.on('chat message', (data) => {
                           const div = document.createElement('div');
                               div.classList.add('message', data.username === username || data.username === anonymousUsername ? 'sent' : 'received');
                           div.innerHTML = \`
                               \${data.username.startsWith('anonimo') || data.username.startsWith('anonima') ? '' : '<img src="/uploads/' + data.profile_pic + '" class="profile-pic">'}
                            <div class="message-content">
                              <strong>\${data.username.startsWith('anonimo') || data.username.startsWith('anonima') ? data.username : '<a href="/perfil/' + data.username + '">' + data.username + '</a>'}</strong>
                            <p>\${data.message}</p>
                         \${data.media ? (data.media.endsWith('.mp4') ? '<video controls src="/uploads/' + data.media + '" style="max-width: 100%;"></video>' : '<img src="/uploads/' + data.media + '" style="max-width: 100%;">') : ''}
                              </div>
                       \`;
                    messages.appendChild(div);
                          messages.scrollTop = messages.scrollHeight;
                 });

                         document.getElementById('chat-form').addEventListener('submit', async (e) => {
                         e.preventDefault();
      
                       const messageInput = document.getElementById('message');
                         const fileInput = document.getElementById('media');
                             const senderTypeSelect = document.getElementById('sender-type');
                         const message = messageInput.value.trim();
                        const file = fileInput.files[0];
                     const senderType = senderTypeSelect.value;

                   const formData = new FormData();
                          formData.append('message', message);
                         formData.append('type', senderType)

                         if(file){
                          formData.append('media',file)
                        }


                             try{
                         const res = await fetch(\`/chat\`,{
                        method: 'POST',
                         body: formData
                      })
                           if(!res.ok){
                             const data = await res.text()
                              throw new Error(data)
                              }
                            messageInput.value = '';
                          fileInput.value= '';
                           }catch(error){
                              console.log("Houve um erro: ",error)
                           alert("Houve um erro, por favor tente novamente!");
                         }
                  });
                 messages.scrollTop = messages.scrollHeight;
              </script>
             </body>
             </html>
        `);
    });
});

app.post('/chat', upload.single('media'), isLoggedIn, (req, res) => {
    const { message, type, replyTo } = req.body;
    const media = req.file ? req.file.filename : null;
    const username = type === 'real' ? req.session.user.username : req.session.user.anonymous_username;

    if (!message && !media) {
        return res.status(400).send('Mensagem ou mídia são necessários');
    }

    db.run('INSERT INTO messages (username, message, media, timestamp) VALUES (?, ?, ?, ?)',
        [username, message || '', media, new Date().toISOString()],
        function (err) {
            if (err) {
                console.error('Erro ao enviar mensagem:', err);
                return res.status(500).send('Erro no servidor');
            }

            const messageId = this.lastID;

            // Salvar relação de resposta, se houver
            if (replyTo) {
                db.run('INSERT INTO reply_messages (original_message_id, reply_message_id) VALUES (?, ?)',
                    [replyTo, messageId],
                    (err) => {
                        if (err) {
                            console.error('Erro ao salvar reply:', err);
                        }
                    });
            }

            io.emit('chat message', { id: messageId, username, message, media, replyTo });
            res.redirect('/chat');
        });
});


// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Validação para impedir espaços em branco no nome de usuário e senha
    if (/\s/.test(username) || /\s/.test(password)) {
        return res.status(400).send('<script>alert("Nome de usuário e senha não podem conter espaços!"); window.location.href="/login";</script>');
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).send('Erro no servidor');
        if (!user || user.password !== password) {
            return res.status(400).send('<script>alert("Usuário ou senha inválidos!"); window.location.href="/login";</script>');
        }

        req.session.user = user;
        res.redirect('/chat');
    });
});


io.on('connection', (socket) => {
    console.log('Novo usuário conectado!');

    db.all('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 20', (err, rows) => {
        if (!err) socket.emit('chat history', rows.reverse());
    });

    socket.on('chat message', (data) => {
        const { username, message, profile_pic } = data;
        db.run('INSERT INTO messages (username, message) VALUES (?, ?)', [username, message], (err) => {
            if (err) console.error(err);
        });
        io.emit('chat message', data);
    });

    socket.on('private message', (data) => {
        const { sender, receiver, message } = data;

        // Verificar se o receptor é um nome de usuário anônimo e obter o nome de usuário real correspondente
        db.get('SELECT username FROM users WHERE anonymous_username = ?', [receiver], (err, row) => {
            if (err) {
                console.error(err);
                return;
            }

            const actualReceiver = row ? row.username : receiver;

            db.run('INSERT INTO private_messages (sender, receiver, message) VALUES (?, ?, ?)', 
                [sender, actualReceiver, message], (err) => {
                    if (err) console.error(err);
                });

            socket.to(actualReceiver).emit('private message', data);
        });
    });

    socket.on('disconnect', () => {
        console.log('Usuário desconectado!');
    });
});


// Página de postagens
app.get('/postagens', isLoggedIn, (req, res) => {
    const username = req.session.user.username;

    db.all('SELECT * FROM posts WHERE is_profile_post = 0 ORDER BY timestamp DESC', (err, rows) => {
        if (err) return res.status(500).send('Erro no servidor');

        db.all('SELECT * FROM comentarios ORDER BY timestamp ASC', (err, comentarios) => {
            if (err) return res.status(500).send('Erro no servidor');

            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Postagens</title>
                    <link href="/tailwind.css" rel="stylesheet">
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
                    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>

                    <style>
                        @keyframes fadeIn {
                            from {
                                opacity: 0;
                            }
                            to {
                                opacity: 1;
                            }
                        }
                        .fade-in {
                            animation: fadeIn 1s ease-in-out;
                        }
                        .post img, .post video {
                            max-width: 100%;
                            max-height: 500px;
                            border-radius: 10px;
                        }
                        body {
                            background-color: black;
                            color: #fff;
                        }
                        .navbar a {
                            color: #aaa !important;
                        }
                        .navbar a.active,
                        .navbar a:hover {
                            color: #4B0082 !important; 
                        }
                        .navbar-toggler {
                            background-color: #4B0082 !important; /* Cor de fundo */
                            border-color: #4B0082 !important;   /* Cor da borda */
                        }
                    </style>
                </head>
                <body>
                    <nav class="navbar navbar-expand-lg" style="background-color: #0D0D0D ;">
                        <div class="container-fluid">
                            <h1 class=" font-bold navbar-brand" style="color: white;">POSTAGENS NOVA ERA</h1>
                            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                                <span class="navbar-toggler-icon"></span>
                            </button>
                            <div class="collapse navbar-collapse" id="navbarNav">
                                <ul class="navbar-nav ms-auto">
                                    <li class="nav-item">
                                        <a class="nav-link active" href="/postagens">Postagens</a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link" href="/chat">Chat</a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link" href="/privado">Privado</a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link " href="/perfil/${username}">Perfil</a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link" href="/denuncias">Denúncias</a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </nav>
                    <div class="post-container max-w-4xl mx-auto p-6 fade-in" style="margin-top: 3%;">
                      
                        <form style="background-color: #0D0D0D ;" class="post-form p-4 rounded-lg mb-6" id="post-form" enctype="multipart/form-data" action="/post" method="POST">
                            <textarea id="post-text" name="text" placeholder="Escreva algo..." class="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-red-700"></textarea>
                            <input type="file" id="post-media" name="media" accept="image/*,video/*" class="hidden" style="display: none;">
                            <label for="post-media" style="width:15%; background-color: #198754;" class="mt-2 text-white font-bold py-2 px-4 rounded transition duration-200 cursor-pointer"><i class="fa-solid fa-image" style="width:15%; text-align: center;"></i></label>
                            <select id="post-type" name="type" class="mt-2 p-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-red-700">
                                <option value="real">Postar como ${username}</option>
                                <option value="anonymous">Postar como ${req.session.user.anonymous_username}</option>
                            </select>
                            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
                            <button type="submit" style="width:20%; margin-left: 9.5%; background-color: #198754;" class="mt-4 text-white font-bold py-2 px-4 rounded transition duration-200"><i class="fa-solid fa-arrow-up-from-bracket"></i></button>
                        </form>
                        <div id="posts" class="space-y-4">
                            ${rows.map(post => `
                                <div style="background-color: #0f0f0f;" class="post p-4 rounded-lg">
                                    <center><strong class="text-white" style="font-size: 1.4rem; text-align: center; margin-top: 2%;">${post.username}</strong></center>
                                    ${post.media ? (post.media.endsWith('.mp4') ? `<video controls src="/uploads/${post.media}" class="w-full rounded-lg mt-2" style="margin-top:1%;"></video>` : `<img src="/uploads/${post.media}" class="w-full rounded-lg mt-2" style="margin-top:1%;">`) : ''}
                                    <p class="mt-2 text-white" style="font-size: 1.3rem; margin-left: 3.8%; margin-top: 3.5%; margin-bottom: 2%;">${post.text}</p>
                                    <div class="comments mt-4">
                                        <h5 class="text-white">Comentários:</h5>
                                        ${comentarios.filter(comentario => comentario.post_id === post.id).map(comentario => `
                                            <div class="comment bg-gray-700 p-2 rounded-lg mt-2">
                                                <strong class="text-white">${comentario.anonymous_username}</strong>
                                                <p class="text-white">${comentario.comentario}</p>
                                            </div>
                                        `).join('')}
                                        <form action="/postagens/${post.id}/comentar" method="POST" class="mt-2">
                                            <input type="text" name="comentario" style="color: black;" placeholder="Escreva um comentário anonimo..." class="w-full p-2 bg-gray-600 border border-gray-500 rounded focus:outline-none focus:ring-2 focus:ring-red-700">
                                            <button type="submit" class="mt-2 py-2 px-4 bg-success rounded text-white font-bold transition duration-200">Comentar</button>
                                        </form>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <script>
                        document.getElementById('post-media').addEventListener('change', function(event) {
                            const file = event.target.files[0];
                            const preview = document.getElementById('media-preview');
                            preview.innerHTML = '';
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = function(e) {
                                    const mediaElement = file.type.startsWith('video') ? document.createElement('video') : document.createElement('img');
                                    mediaElement.src = e.target.result;
                                    mediaElement.classList.add('w-full', 'rounded-lg');
                                    preview.appendChild(mediaElement);
                                };
                                reader.readAsDataURL(file);
                            }
                        });
                    </script>
                </body>
                </html>
            `);
        });
    });
});


// Processar comentários
app.post('/postagens/:postId/comentar', isLoggedIn, (req, res) => {
    const { comentario } = req.body;
    const username = req.session.user.username;
    const anonymousUsername = req.session.user.anonymous_username;
    const postId = req.params.postId;

    if (!comentario) {
        return res.status(400).send('Comentário é necessário');
    }

    db.run('INSERT INTO comentarios (post_id, username, anonymous_username, comentario, timestamp) VALUES (?, ?, ?, ?, ?)', 
        [postId, username, anonymousUsername, comentario, new Date().toISOString()], 
        (err) => {
            if (err) {
                console.error('Erro ao enviar comentário:', err);
                return res.status(500).send('Erro no servidor');
            }
            res.redirect('/postagens');
        });
});

// Processar denúncias
app.post('/denuncias', isLoggedIn, (req, res) => {
    const { denuncia } = req.body;
    const username = req.session.user.username;

    if (!denuncia) {
        return res.status(400).send('Denúncia é necessária');
    }

    db.run('INSERT INTO denuncias (username, denuncia, timestamp) VALUES (?, ?, ?)', 
        [username, denuncia, new Date().toISOString()], 
        (err) => {
            if (err) {
                console.error('Erro ao enviar denúncia:', err);
                return res.status(500).send('Erro no servidor');
            }
            res.send(`
                <script>
                    alert("Denúncia enviada com sucesso");
                    window.location.href = "/denuncias";
                </script>
            `);
        });
});

// Página de perfil
app.get('/perfil/:username', isLoggedIn, (req, res) => {
    const { username } = req.params;
    const isOwner = req.session.user.username === username;

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).send('Erro no servidor');
        if (!user) return res.status(404).send('Usuário não encontrado');

        db.all('SELECT * FROM posts WHERE username = ? AND is_profile_post = 1 ORDER BY timestamp DESC', [username], (err, posts) => {
            if (err) return res.status(500).send('Erro no servidor');

            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Perfil de ${user.username}</title>
                    <link href="/tailwind.css" rel="stylesheet">
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
                    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>

                    <style>
                        @keyframes fadeIn {
                            from {
                                opacity: 0;
                            }
                            to {
                                opacity: 1;
                            }
                        }
                        .fade-in {
                            animation: fadeIn 1s ease-in-out;
                        }
                        .profile-pic {
                            width: 128px;
                            height: 128px;
                            border-radius: 50%;
                            object-fit: cover;
                            margin: 0 auto;
                            margin-top: 3.5%;
                        }
                        .post img, .post video {
                            max-width: 100%;
                            max-height: 500px;
                            border-radius: 10px;
                        }
                          body {
                    background-color: #121212;
                    color: #fff;
                }
                .navbar a {
                    color: #aaa !important;
                }
                .navbar a.active,
                .navbar a:hover {
                    color: #4B0082 !important; 
                }

                     .navbar-toggler {
        background-color: #4B0082 !important; /* Cor de fundo */
        border-color: #4B0082 !important;   /* Cor da borda */
                 
                    </style>
                </head>
                <body text-white">
                    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
                <div class="container-fluid">
                    <a class="navbar-brand" href="#">Perfil</a>
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    <div class="collapse navbar-collapse" id="navbarNav">
                        <ul class="navbar-nav ms-auto">
                            <li class="nav-item">
                                <a class="nav-link" href="/postagens">Postagens</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="/chat">Chat</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="/privado">Privado</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link active" href="/perfil/${username}">Perfil</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="/denuncias">Denúncias</a>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>
                    <div class="profile-container max-w-4xl mx-auto p-6 fade-in">
                        <div class="profile-header text-center mb-6">
                            <img src="/uploads/${user.profile_pic}" class="profile-pic">
                            <h1 class="profile-username text-3xl font-bold mt-4">${user.username}</h1>
                            <div class="profile-actions mt-4 flex justify-center space-x-4">
                                ${isOwner ? '<button onclick="document.getElementById(\'profile-pic-input\').click()" style="background-color: #4B0082; width: 38%" class="text-white font-bold py-2 px-4 rounded transition duration-200" style="width:38%;">Mudar Foto<i class="fa-solid fa-camera"></i></button>' : ''}
                                <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">

                                ${!isOwner ? `<button onclick="window.location.href='/private/${user.username}'" class="text-white font-bold py-2 px-4 rounded transition duration-200" style="width:45%; background-color: #4B0082;">Mensagem <i class="fa-solid fa-right-long"></i></button>` : ''}
                            </div>
                            ${isOwner ? `
                                <form id="profile-pic-form" style="display:none" enctype="multipart/form-data" action="/update-profile-pic" method="POST">
                                    <input type="file" id="profile-pic-input" name="profile_pic" accept="image/*" onchange="document.getElementById('profile-pic-form').submit()">
                                </form>
                            ` : ''}
                        </div>
                        ${isOwner ? `
                            <form class="post-form bg-gray-800 p-4 rounded-lg mb-6" id="post-form" enctype="multipart/form-data" action="/perfil/${username}/post" method="POST">
                                <textarea id="post-text" name="text" placeholder="Escreva algo..." class="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-red-700"></textarea>
                                <input type="file" id="post-media" name="media" accept="image/*,video/*" class="mt-2 hidden" style="display: none;">
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">

<div class="text-center">
    <label for="post-media" style="background-color: #198754;" class="mt-2 text-white font-bold py-2 px-4 rounded transition duration-200 cursor-pointer flex items-center justify-center">
        <i class="fa-solid fa-images"></i> <!-- Ícone de upload -->
        Suas Fotos
    </label>
</div>                                <div id="media-preview" class="mt-4"></div>
                                <div style="text-align: right;"><button type="submit" style="width:50%; background-color: #198754;" class="mt-4 text-white font-bold py-2 px-4 rounded transition duration-200">Postar<i class="fa-solid fa-arrow-up-from-bracket"></i></button></div>
                            </form>
                        ` : ''}
                        <div id="posts" class="space-y-4">
                            ${posts.map(post => `
                                <div class="post bg-gray-800 p-4 rounded-lg" style="margin-top: 4%;">
                                    ${post.media ? (post.media.endsWith('.mp4') ? `<video controls src="/uploads/${post.media}" class="w-full rounded-lg"></video>` : `<img src="/uploads/${post.media}" class="w-full rounded-lg">`) : ''}
                                    <p class="text-white" style="margin-left: 3.8%; margin-top: 3.5%; margin-bottom: 2% ;font-size: 1.3rem;">${post.text}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="text-center" style="margin-top: 12.5%">
                        <button onclick="window.location.href='/logout'" class="bg-red-700 hover:bg-red-800 text-white font-bold py-2 px-4 rounded transition duration-200" style="width: 20rem;"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
                    </div>
                    <script>
                        document.getElementById('post-media').addEventListener('change', function(event) {
                            const file = event.target.files[0];
                            const preview = document.getElementById('media-preview');
                            preview.innerHTML = '';
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = function(e) {
                                    const mediaElement = file.type.startsWith('video') ? document.createElement('video') : document.createElement('img');
                                    mediaElement.src = e.target.result;
                                    mediaElement.classList.add('w-full', 'rounded-lg');
                                    preview.appendChild(mediaElement);
                                };
                                reader.readAsDataURL(file);
                            }
                        });
                    </script>
                </body>
                </html>
            `);
        });
    });
});



// Processar postagens no perfil
app.post('/perfil/:username/post', upload.single('media'), isLoggedIn, (req, res) => {
    const { text } = req.body;
    const media = req.file ? req.file.filename : null;
    const username = req.params.username;

    if (username !== req.session.user.username) {
        return res.status(403).send('Você não tem permissão para postar no perfil de outro usuário');
    }

    if (!text && !media) {
        return res.status(400).send('<script>alert("É necessário postar no mínimo uma mídia ou um texto!"); window.location.href="/perfil/${username}";</script>');
    }

    db.run('INSERT INTO posts (username, text, media, timestamp, is_profile_post) VALUES (?, ?, ?, ?, 1)', 
        [username, text || '', media, new Date().toISOString()], 
        (err) => {
            if (err) {
                console.error('Erro ao postar:', err);
                return res.status(500).send('Erro no servidor');
            }
            res.redirect(`/perfil/${req.session.user.username}`);
        });
});

// Atualizar foto de perfil
app.post('/update-profile-pic', upload.single('profile_pic'), isLoggedIn, (req, res) => {
    const profile_pic = req.file ? req.file.filename : null;
    const username = req.session.user.username;

    if (!profile_pic) {
        return res.status(400).send('Nenhuma foto enviada');
    }

    db.run('UPDATE users SET profile_pic = ? WHERE username = ?', [profile_pic, username], (err) => {
        if (err) {
            console.error('Erro ao atualizar foto de perfil:', err);
            return res.status(500).send('Erro no servidor');
        }
        res.redirect(`/perfil/${username}`);
    });
});

// Processar postagens
app.post('/post', upload.single('media'), isLoggedIn, (req, res) => {
    const { text, type } = req.body;
    const media = req.file ? req.file.filename : null;
    const username = type === 'real' ? req.session.user.username : req.session.user.anonymous_username;

    if (!text && !media) {
        return res.status(400).send('<script>alert("É necessário postar no mínimo uma mídia ou um texto!"); window.location.href="/postagens";</script>');
    }

    db.run('INSERT INTO posts (username, text, media, timestamp, is_profile_post) VALUES (?, ?, ?, ?, 0)', 
        [username, text || '', media, new Date().toISOString()], 
        (err) => {
            if (err) {
                console.error('Erro ao postar:', err);
                return res.status(500).send('Erro no servidor');
            }
            res.redirect('/postagens');
        });
});

// DENUNCIAS Página de denúncias
app.get('/denuncias', isLoggedIn, (req, res) => {
    const username = req.session.user.username;

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Denúncias</title>
            <!-- Bootstrap 5 -->
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
                body {
                    background-color: #121212;
                    color: #fff;
                }
                .navbar a {
                    color: #aaa !important;
                }
                .navbar a.active,
                .navbar a:hover {
                    color: #4B0082 !important; 
                }
                textarea:focus {
                    border-color: #f00 !important;
                    box-shadow: 0 0 5px rgba(255, 0, 0, 0.5) !important;
                }
                

                 .navbar-toggler {
        background-color: #4B0082 !important; /* Cor de fundo */
        border-color: #4B0082 !important;   /* Cor da borda */
    }
            </style>
        </head>
        <body>
            <!-- Navbar -->
            <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
                <div class="container-fluid">
                    <a class="navbar-brand" href="#">Denúncias/Sugestões</a>
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    <div class="collapse navbar-collapse" id="navbarNav">
                        <ul class="navbar-nav ms-auto">
                            <li class="nav-item">
                                <a class="nav-link" href="/postagens">Postagens</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="/chat">Chat</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="/privado">Privado</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="/perfil/${username}">Perfil</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link active" href="/denuncias">Denúncias</a>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>

            <!-- Conteúdo principal -->
            <div class="container mt-5">
                <div class="row justify-content-center">
                    <div class="col-12 col-md-8 col-lg-6">
                        <div class="card bg-dark border-secondary">
                            <div class="card-header text-center border-secondary">
                                <center>
                                    <h3 class="text-danger">Denúncias</h3>
                                </center>
                            </div>
                            <div class="card-body">
                                <form action="/denuncias" method="POST">
                                    <!-- Textarea -->
                                    <div class="mb-3">
                                        <label for="denuncia" class="form-label">Envie sua denúncia anonima:</label>
                                        <textarea id="denuncia" name="denuncia" class="form-control bg-secondary text-light border-secondary" rows="5" placeholder="Descreva o ocorrido aqui..." required></textarea>
                                    </div>
                                    <!-- Botão -->
                                    <div class="d-grid">
                                        <button type="submit" class="btn btn-success">Enviar Denúncia</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bootstrap JS -->
            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
        </body>
        </html>
    `);
});

// Processar denúncias
app.post('/denuncias', isLoggedIn, (req, res) => {
    const { denuncia } = req.body;
    const username = req.session.user.username;

    if (!denuncia) {
        return res.status(400).send('Denúncia é necessária');
    }

    db.run('INSERT INTO denuncias (username, denuncia, timestamp) VALUES (?, ?, ?)', 
        [username, denuncia, new Date().toISOString()], 
        (err) => {
            if (err) {
                console.error('Erro ao enviar denúncia:', err);
                return res.status(500).send('Erro no servidor');
            }
            res.send(`
                <script>
                    alert("Denúncia enviada com sucesso");
                    window.location.href = "/denuncias";
                </script>
            `);
        });
});


// Iniciar o servidor
server.listen(3000, '0.0.0.0', () => {
    console.log('Servidor rodando em http://0.0.0.0:3000');
});
