# gcs-basic-auth とは

gcs-basic-auth は、Google Cloud Storage(以下、GCS)のファイルを Basic 認証をつけて公開するためプログラムです。
Google App Engine(以下、GAE)にデプロイして使用します。

GAE にアクセスされると Basic 認証を表示し、認証されるとリバースプロキシのように動いて GCS のファイルをユーザに転送します。

# How it works

1.[Releases](https://github.com/ToMGitHubN/gcs-basic-auth/releases)からファイルをダウンロード OR クローン

2.ダウンロードしたファイルの設定(setting.yaml)を記載

設定の中の以下を編集

```yaml
env_variables:
  # Google Cloud Storage Name
  BUCKET_NAME: 'hoge_bucket_name'#<-あなたが設定したGoogle Cloud Storageのバケット名
  #BASIC AUTH
  BASIC_AUTH_ENABLED: 'true'
  BASIC_AUTH_NAME: 'hoge_name'#<-Basic認証で入力させたいユーザ名
  BASIC_AUTH_PASSWORD: 'hoge_password'#<-Basic認証で入力させたいパスワード
```

3.GAE の standard(node)にデプロイ

4.GAE にアクセスして表示を確認

表示されない場合、IAM の権限が足りているか、stackDrive Logging ページを確認します。

```
Management (IAM) API has not been used in project
```

などが、出ているときは指示に従って権限を追加します。

# その他設定系

```yaml
env_variables:
  # Google Cloud Storage Name
  BUCKET_NAME: 'hoge_bucket_name'#<-あなたが設定したGoogle Cloud Storageのバケット名
  #BASIC AUTH
  BASIC_AUTH_ENABLED: 'true'#<-Basic認証の有効/無効切り替え (true:有効 false:無効)
  BASIC_AUTH_NAME: 'hoge_name'#<-Basic認証で入力させたいユーザ名
  BASIC_AUTH_PASSWORD: 'hoge_password'#<-Basic認証で入力させたいパスワード
  # Page Option
  DEFAULT_PAGE: 'index.html'#<-URLのファイルが存在しないときに表示する。ディレクトリ単位
  NOT_FOUND_PAGE: '404.html'#<-URLのファイルが存在せず、DEFAULT_PAGEも存在しないときに表示する。ルートに置く必要がある
  # Tranfer Option
  # TRANSFER_MODE List: ALL_DIRECT or ALLOW_DIRECT or ALLOW_REDIRECT
  # ALL_DIRECT : all file direct transfer
  # ALLOW_DIRECT : ALLOW_DIRECT_LIST extension direct transfer, other file redirect
  # ALLOW_REDIRECT : ALLOW_REDIRECT_LIST file redirect GCS, other file direct transfer
  TRANSFER_MODE: 'ALLOW_REDIRECT'#<-転送モード。ややこしいので、後述します
  # TRANSFER_MODE = ALLOW_DIRECT Only
  # extension of the target file
  ALLOW_DIRECT_LIST: '["html", "css", "js", "json"]'#<-後述
  # TRANSFER_MODE = ALLOW_REDIRECT Only
  # extension of the target file
  ALLOW_REDIRECT_LIST: '["mp4"]'#<-後述
  # GCP Option
  # transfer limit time
  # memo: 1 hour = 1000 * 60 * 60 = 3600000ms
  GCS_URL_LIFETIME: 3600000 #<-後述
  # DEBUG
  STACKDRIVER_DEBUGGER: 'false'#<-STACKDRIVERでデバッグしたいときに(false:デバッグしない)
```

### 転送モードについて

設定の TRANSFER_MODE(転送モード)について説明します。

転送の基本的な動きは、ユーザがアクセスすると、GAE が `GCS->GAE->ブラウザ/ユーザ` と流れます。
ただし、GAE の standard は 60 秒しか動作しないため、巨大ファイルだと転送が間に合わない可能性があります。
そこで、GCS の署名付き URL(一定期間のみ使用可能な URL)を使い、ファイル転送を GCS から行います。
転送の流れが、 `GAE->(署名付きURL)->ブラウザ->(リダイレクト)->GCS->(ファイル転送)->ブラウザ` とすることで巨大ファイルの問題を解決できます。
また、GCS->GAE と経由するより直接転送したほうが安くなります。
ただし、HTML を署名付き URL で取得すると、正常に機能しません。
URL が GCS になるため、HTML は GCS を起点にファイルを取得しようとし、失敗します。
これは、CSS や JS にも当てはまります。

どのファイルを GCS 署名付き URL を使うかの設定が転送モードです。

- TRANSFER_MODE: 'ALL_DIRECT' => すべてのファイルは GAE を経由して転送
- TRANSFER_MODE: 'ALLOW_DIRECT' => ALLOW_DIRECT_LIST に記載したファイルのみ GAE を経由して転送
- TRANSFER_MODE: 'ALLOW_REDIRECT' => ALLOW_REDIRECT_LIST に記載されていないファイルを GAE を経由して転送

ALLOW_DIRECT_LIST と、ALLOW_REDIRECT_LIST には、対象としたいファイルの拡張子を記載下さい。

また、署名付き URL の有効時間は、GCS_URL_LIFETIME で設定できます。(初期値:1 時間)

GAE 転送する必要があり、60 秒で間に合わない場合は、
`app.yaml`の`env: standard` => `env: flexible`に変更することで接続時間を伸ばせます。
ただし、サーバスケールが分速に遅くなるので、ある程度サーバ台数を確保しておく必要があります。
