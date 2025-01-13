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
                        .navbar {
                        background-color:rgba(10, 10, 10, 0.94);
                        overflow: hidden;
                        display: flex;
                        justify-content: center;
                        padding: 10px;
                    }
                    .navbar a {
                        color: white;
                        padding: 14px 20px;
                        text-align: center;
                        text-decoration: none;
                        font-size: 18px;
                        transition: background-color 0.3s ease;
                    }
                    .navbar a:hover {
                        background-color: #1F1F1F;
                    }
                    .navbar a.active {
                        background-color: #B91C1C;
                    }
                 
                    </style>
                </head>
                <body class="bg-gray-900 text-white">
                    <nav class="navbar bg-gray-800 p-4 flex justify-center space-x-4">
                        <a href="/postagens" class="text-gray-400 hover:text-red-700 transition duration-200">Posts</a>
                        <a href="/chat" class="text-gray-400 hover:text-red-700 transition duration-200">Chat</a>
                        <a href="/privado" class="text-gray-400 hover:text-red-700 transition duration-200">Privado</a>
                        <a href="/perfil/${username}" class="text-red-700 active">Perfil</a>
                    </nav>
                    <div class="profile-container max-w-4xl mx-auto p-6 fade-in">
                        <div class="profile-header text-center mb-6">
                            <img src="/uploads/${user.profile_pic}" class="profile-pic">
                            <h1 class="profile-username text-3xl font-bold mt-4">${user.username}</h1>
                            <div class="profile-actions mt-4 flex justify-center space-x-4">
                                ${isOwner ? '<button onclick="document.getElementById(\'profile-pic-input\').click()" class="bg-red-700 hover:bg-red-800 text-white font-bold py-2 px-4 rounded transition duration-200" style="width:38%;">Mudar Foto<i class="fa-solid fa-camera"></i></button>' : ''}
                                <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">

                                ${!isOwner ? `<button onclick="window.location.href='/private/${user.username}'" class="bg-red-700 hover:bg-red-800 text-white font-bold py-2 px-4 rounded transition duration-200" style="width:45%">Mensagem <i class="fa-solid fa-right-long"></i></button>` : ''}
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
    <label for="post-media" class="mt-2 bg-red-700 hover:bg-red-800 text-white font-bold py-2 px-4 rounded transition duration-200 cursor-pointer flex items-center justify-center">
        <i class="fa-solid fa-images"></i> <!-- Ícone de upload -->
        Suas Fotos
    </label>
</div>                                <div id="media-preview" class="mt-4"></div>
                                <div style="text-align: right;"><button type="submit" style="width:50%;" class="mt-4 bg-red-700 hover:bg-red-800 text-white font-bold py-2 px-4 rounded transition duration-200">Postar<i class="fa-solid fa-arrow-up-from-bracket"></i></button></div>
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