import {article, author, collection, product, redirect, siteSettings} from './documents'
import {animatedImageWithCaption, audioWithTranscript, callout, codeBlock, downloadableFile, imageWithCaption, procedure, richContent, simpleTable, videoWithCaption} from './richContent'

export const schemaTypes = [product, collection, article, author, siteSettings, redirect, richContent, callout, imageWithCaption, animatedImageWithCaption, videoWithCaption, audioWithTranscript, downloadableFile, procedure, simpleTable, codeBlock]