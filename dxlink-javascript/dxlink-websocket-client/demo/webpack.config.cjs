const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const SELF = path.resolve(__dirname)

const config = {
  entry: path.resolve(SELF, './index.ts'),
  mode: 'development',
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(SELF, './index.html'),
    }),
  ],
  optimization: {
    runtimeChunk: 'single',
    moduleIds: 'deterministic',
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  },
  module: {
    rules: [
      {
        test: /.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              configFile: path.resolve(SELF, './tsconfig.json'),
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  devtool: 'inline-source-map',
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
}

module.exports = config
